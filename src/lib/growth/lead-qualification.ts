export type LeadQualificationInput = {
  crmTaskId?: string | null;
  leadName?: string | null;
  legalArea?: string | null;
  pain?: string | null;
  origin?: string | null;
  score?: number | null;
  tags?: string[] | null;
};

export type LeadQualificationPlan = {
  leadName: string;
  legalArea: string | null;
  confidence: "low" | "medium" | "high";
  qualificationScript: string[];
  minimumDocuments: string[];
  likelyObjections: string[];
  riskFlags: string[];
  nextBestAction: string;
  requiresHumanHandoff: boolean;
  summary: string;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeArea(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getAreaPlaybook(legalArea: string | null) {
  const area = normalizeArea(legalArea);

  if (area?.includes("previd")) {
    return {
      script: [
        "Qual foi o beneficio negado ou revisado?",
        "Existe carta de indeferimento, processo administrativo ou numero do Meu INSS?",
        "Quais periodos de contribuicao, afastamento ou atividade especial precisam ser provados?",
        "Ha urgencia financeira ou risco de perda de prazo?",
      ],
      documents: ["Documento pessoal", "CNIS", "Carta de indeferimento", "Processo administrativo", "Laudos/PPP quando houver"],
      objections: ["Nao tenho todos os documentos", "Nao sei se vale a pena recorrer", "Tenho receio do custo inicial"],
    };
  }

  if (area?.includes("trabalh")) {
    return {
      script: [
        "Qual foi o vinculo de trabalho e periodo aproximado?",
        "Houve registro em carteira, rescisao, verbas pendentes ou assedio?",
        "Existe audiencia, prazo ou notificacao recebida?",
        "Ha testemunhas, mensagens, holerites ou documentos de pagamento?",
      ],
      documents: ["CTPS", "Contrato ou mensagens", "Holerites", "TRCT/rescisao", "Comprovantes de pagamento"],
      objections: ["Tenho medo de retalhacao", "Nao tenho testemunhas", "Nao sei calcular o valor"],
    };
  }

  if (area?.includes("famil")) {
    return {
      script: [
        "Qual e o vinculo familiar e qual decisao precisa ser tomada agora?",
        "Ha menores envolvidos, alimentos, guarda ou partilha?",
        "Existe processo em andamento, acordo anterior ou medida urgente?",
        "Quais documentos comprovam renda, despesas e rotina familiar?",
      ],
      documents: ["Documento pessoal", "Certidoes", "Comprovantes de renda", "Comprovantes de despesas", "Decisoes/acordos anteriores"],
      objections: ["Tenho receio de conflito", "Preciso resolver rapido", "Nao sei quais provas servem"],
    };
  }

  return {
    script: [
      "Qual e o problema principal em uma frase?",
      "Existe prazo, audiencia, notificacao ou risco imediato?",
      "Quais documentos comprovam os fatos principais?",
      "O lead ja tentou resolver antes ou existe outro advogado atuando?",
    ],
    documents: ["Documento pessoal", "Comprovantes dos fatos", "Contratos/mensagens", "Notificacoes ou decisoes recebidas"],
    objections: ["Nao sei se meu caso tem chance", "Quero entender custos", "Ainda estou reunindo documentos"],
  };
}

export function buildLeadQualificationPlan(input: LeadQualificationInput): LeadQualificationPlan {
  const leadName = cleanText(input.leadName) || "Lead sem nome";
  const legalArea = cleanText(input.legalArea);
  const pain = cleanText(input.pain);
  const score = numberOrNull(input.score);
  const playbook = getAreaPlaybook(legalArea);
  const riskFlags = [
    pain && /urgente|hoje|amanha|amanh[aã]|prazo|audiencia|audi[eê]ncia|liminar|bloqueio/i.test(pain)
      ? "urgencia_ou_prazo"
      : null,
    !legalArea ? "area_juridica_nao_informada" : null,
    !pain ? "dor_principal_nao_informada" : null,
    score !== null && score < 45 ? "baixa_confianca_comercial" : null,
  ].filter(Boolean) as string[];
  const confidence = !legalArea || !pain
    ? "low"
    : score !== null && score >= 75
      ? "high"
      : "medium";
  const requiresHumanHandoff = confidence === "low" || riskFlags.includes("urgencia_ou_prazo") || (score !== null && score >= 75);
  const nextBestAction = requiresHumanHandoff
    ? "SDR deve assumir o contato, validar urgencia, confirmar documentos minimos e registrar retorno supervisionado."
    : "SDR pode seguir roteiro de qualificacao, confirmar aderencia da tese e propor proximo retorno.";

  return {
    leadName,
    legalArea,
    confidence,
    qualificationScript: playbook.script,
    minimumDocuments: playbook.documents,
    likelyObjections: playbook.objections,
    riskFlags,
    nextBestAction,
    requiresHumanHandoff,
    summary: `Plano de qualificacao criado para ${leadName}${legalArea ? ` em ${legalArea}` : ""}.`,
  };
}

export function buildLeadQualificationArtifactMetadata(params: {
  crmTaskId?: string | null;
  plan: LeadQualificationPlan;
}) {
  return {
    summary: params.plan.summary,
    crm_task_id: params.crmTaskId || null,
    lead_name: params.plan.leadName,
    legal_area: params.plan.legalArea,
    qualification_confidence: params.plan.confidence,
    qualification_script: params.plan.qualificationScript,
    minimum_documents: params.plan.minimumDocuments,
    likely_objections: params.plan.likelyObjections,
    risk_flags: params.plan.riskFlags,
    next_best_action: params.plan.nextBestAction,
    requires_human_handoff: params.plan.requiresHumanHandoff,
    requires_human_action: params.plan.requiresHumanHandoff,
    human_actions: params.plan.requiresHumanHandoff ? [params.plan.nextBestAction] : [],
  };
}
