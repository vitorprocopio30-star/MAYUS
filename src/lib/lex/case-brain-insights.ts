import type { LegalCaseContextSnapshot } from "@/lib/lex/case-context";
import { buildProcessMissionContext } from "@/lib/lex/process-mission-context";

export type CaseBrainInsightSeverity = "high" | "medium" | "low";

export type CaseBrainTimelineItem = {
  date: string | null;
  label: string;
  source: string;
  confidence: "confirmed" | "inferred";
};

export type CaseBrainRiskItem = {
  severity: CaseBrainInsightSeverity;
  title: string;
  reason: string;
  recommendedAction: string;
};

export type CaseBrainContradictionItem = {
  severity: CaseBrainInsightSeverity;
  title: string;
  evidence: string[];
  recommendedAction: string;
};

export type CaseBrainFactMap = {
  documentedFacts: string[];
  inferences: string[];
  hypotheses: string[];
};

export type CaseBrainDocumentEvidence = {
  id: string;
  name: string;
  documentType: string | null;
  folderLabel: string | null;
  modifiedAt: string | null;
  extractionStatus: string | null;
  excerpt: string | null;
};

export type CaseBrainMovementEvidence = {
  date: string | null;
  content: string;
  source: string | null;
  eventType: string | null;
  requiresAction: boolean;
  suggestedAction: string | null;
  confidence: string | null;
};

export type CaseBrainEvidence = {
  documents?: CaseBrainDocumentEvidence[];
  movements?: CaseBrainMovementEvidence[];
};

export type CaseBrainInsights = {
  processTaskId: string;
  processLabel: string;
  clientName: string | null;
  currentPhase: string | null;
  timeline: CaseBrainTimelineItem[];
  risks: CaseBrainRiskItem[];
  contradictions: CaseBrainContradictionItem[];
  factMap: CaseBrainFactMap;
  likelyNextActs: string[];
  groundingGaps: string[];
  evidence: {
    documentCount: number;
    extractedDocumentCount: number;
    movementCount: number;
  };
  confidence: "high" | "medium" | "low";
  recommendedAction: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter((item): item is string => Boolean(item))
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function pushTimelineItem(items: CaseBrainTimelineItem[], item: CaseBrainTimelineItem) {
  const dedupeKey = `${item.date || "sem-data"}:${item.label}:${item.source}`;
  if (items.some((existing) => `${existing.date || "sem-data"}:${existing.label}:${existing.source}` === dedupeKey)) return;
  items.push(item);
}

function sortTimeline(items: CaseBrainTimelineItem[]) {
  return [...items].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
    return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER);
  });
}

function truncateLabel(value: string, max = 180) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function buildTimeline(snapshot: LegalCaseContextSnapshot, evidence: CaseBrainEvidence): CaseBrainTimelineItem[] {
  const items: CaseBrainTimelineItem[] = [];
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;

  pushTimelineItem(items, {
    date: snapshot.processTask.createdAt,
    label: `Processo registrado no MAYUS: ${processLabel}`,
    source: "process_task",
    confidence: "confirmed",
  });

  if (snapshot.documentMemory.lastSyncedAt) {
    pushTimelineItem(items, {
      date: snapshot.documentMemory.lastSyncedAt,
      label: `Memoria documental sincronizada com ${snapshot.documentMemory.documentCount || 0} documento(s).`,
      source: "process_document_memory",
      confidence: "confirmed",
    });
  }

  if (snapshot.caseBrain.currentPhase) {
    pushTimelineItem(items, {
      date: null,
      label: `Fase juridica atual registrada no Case Brain: ${snapshot.caseBrain.currentPhase}.`,
      source: "case_brain",
      confidence: "confirmed",
    });
  }

  if (snapshot.processTask.stageName && snapshot.processTask.stageName !== snapshot.caseBrain.currentPhase) {
    pushTimelineItem(items, {
      date: null,
      label: `Etapa operacional do board: ${snapshot.processTask.stageName}.`,
      source: "process_stage",
      confidence: "confirmed",
    });
  }

  if (snapshot.firstDraft.generatedAt) {
    pushTimelineItem(items, {
      date: snapshot.firstDraft.generatedAt,
      label: `Minuta juridica gerada: ${snapshot.firstDraft.pieceLabel || snapshot.firstDraft.recommendedPieceLabel || "peca sem rotulo"}.`,
      source: "draft_factory",
      confidence: "confirmed",
    });
  }

  for (const document of (evidence.documents || []).slice(0, 5)) {
    pushTimelineItem(items, {
      date: document.modifiedAt,
      label: `Documento no acervo: ${document.name}${document.documentType ? ` (${document.documentType})` : ""}.`,
      source: "process_documents",
      confidence: "confirmed",
    });
  }

  for (const movement of (evidence.movements || []).slice(0, 6)) {
    pushTimelineItem(items, {
      date: movement.date,
      label: `Movimentacao processual: ${truncateLabel(movement.content)}`,
      source: movement.source || "process_movements",
      confidence: movement.confidence === "low" ? "inferred" : "confirmed",
    });
  }

  for (const action of stringArray(snapshot.caseBrain.firstActions).slice(0, 3)) {
    pushTimelineItem(items, {
      date: null,
      label: `Proxima acao indicada pelo Case Brain: ${action}`,
      source: "case_brain_first_actions",
      confidence: "inferred",
    });
  }

  return sortTimeline(items).slice(0, 8);
}

function buildRisks(snapshot: LegalCaseContextSnapshot, evidence: CaseBrainEvidence): CaseBrainRiskItem[] {
  const risks: CaseBrainRiskItem[] = [];
  const missingDocuments = uniqueStrings([
    ...stringArray(snapshot.caseBrain.missingDocuments),
    ...stringArray(snapshot.documentMemory.missingDocuments),
  ]);

  if (snapshot.documentMemory.freshness !== "fresh") {
    risks.push({
      severity: snapshot.documentMemory.freshness === "missing" ? "high" : "medium",
      title: "Memoria documental nao esta fresca",
      reason: snapshot.documentMemory.freshness === "missing"
        ? "Nao ha sincronizacao documental confirmada para o processo."
        : "A ultima sincronizacao documental pode estar defasada.",
      recommendedAction: "Atualizar a memoria documental antes de gerar ou revisar peca.",
    });
  }

  if (missingDocuments.length > 0) {
    risks.push({
      severity: "high",
      title: "Pendencias documentais relevantes",
      reason: `Pendencias registradas: ${missingDocuments.join("; ")}.`,
      recommendedAction: "Coletar ou justificar as pendencias antes de aprovar a estrategia ou minuta final.",
    });
  }

  if (!snapshot.caseBrain.readyForLawCitations || !snapshot.caseBrain.readyForCaseLawCitations) {
    risks.push({
      severity: "medium",
      title: "Grounding juridico incompleto",
      reason: "Normas ou precedentes ainda nao estao totalmente validados para citacao segura.",
      recommendedAction: "Validar fontes normativas e jurisprudenciais antes de usar o texto em peca final.",
    });
  }

  if (snapshot.firstDraft.isStale) {
    risks.push({
      severity: "high",
      title: "Minuta possivelmente defasada",
      reason: "A minuta atual foi marcada como stale em relacao ao contexto juridico mais recente.",
      recommendedAction: "Revisar ou regenerar a minuta antes de qualquer aprovacao/publicacao.",
    });
  }

  if (snapshot.caseBrain.pendingValidationCount > 0 || snapshot.caseBrain.externalValidationGapCount > 0) {
    risks.push({
      severity: "medium",
      title: "Validacoes externas pendentes",
      reason: `Existem ${snapshot.caseBrain.pendingValidationCount || 0} validacao(oes) pendente(s) e ${snapshot.caseBrain.externalValidationGapCount || 0} lacuna(s) externa(s).`,
      recommendedAction: "Resolver lacunas de validacao antes de fortalecer argumentos sensiveis.",
    });
  }

  const documents = evidence.documents || [];
  const unextractedCount = documents.filter((document) => document.extractionStatus && document.extractionStatus !== "extracted").length;
  if (unextractedCount > 0) {
    risks.push({
      severity: "medium",
      title: "Documentos ainda nao extraidos",
      reason: `${unextractedCount} documento(s) do acervo ainda nao tem texto extraido para grounding completo.`,
      recommendedAction: "Reprocessar ou revisar manualmente os documentos antes de usar como prova central.",
    });
  }

  const actionMovements = (evidence.movements || []).filter((movement) => movement.requiresAction || movement.suggestedAction);
  if (actionMovements.length > 0) {
    risks.push({
      severity: "high",
      title: "Movimentacao recente exige acao",
      reason: `${actionMovements.length} movimentacao(oes) indicam providencia juridica ou operacional.`,
      recommendedAction: actionMovements[0]?.suggestedAction || "Revisar movimentacoes recentes e confirmar prazo/providencia com advogado responsavel.",
    });
  }

  return risks.slice(0, 6);
}

function normalizeComparable(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildContradictions(snapshot: LegalCaseContextSnapshot, evidence: CaseBrainEvidence): CaseBrainContradictionItem[] {
  const contradictions: CaseBrainContradictionItem[] = [];
  const stage = cleanString(snapshot.processTask.stageName);
  const casePhase = cleanString(snapshot.caseBrain.currentPhase);
  const documentPhase = cleanString(snapshot.documentMemory.currentPhase);

  if (stage && casePhase && normalizeComparable(stage) !== normalizeComparable(casePhase)) {
    contradictions.push({
      severity: "medium",
      title: "Etapa operacional diverge da fase juridica",
      evidence: [`Board: ${stage}`, `Case Brain: ${casePhase}`],
      recommendedAction: "Confirmar com o advogado responsavel qual fase deve prevalecer antes de responder cliente ou gerar peca.",
    });
  }

  if (documentPhase && casePhase && normalizeComparable(documentPhase) !== normalizeComparable(casePhase)) {
    contradictions.push({
      severity: "medium",
      title: "Memoria documental diverge do Case Brain",
      evidence: [`Document Brain: ${documentPhase}`, `Case Brain: ${casePhase}`],
      recommendedAction: "Reconciliar memoria documental e Case Brain apos nova sincronizacao ou revisao humana.",
    });
  }

  if (snapshot.firstDraft.artifactId && snapshot.firstDraft.caseBrainTaskId && snapshot.caseBrain.taskId && snapshot.firstDraft.caseBrainTaskId !== snapshot.caseBrain.taskId) {
    contradictions.push({
      severity: "high",
      title: "Minuta foi gerada com Case Brain anterior",
      evidence: [`Case Brain atual: ${snapshot.caseBrain.taskId}`, `Case Brain da minuta: ${snapshot.firstDraft.caseBrainTaskId}`],
      recommendedAction: "Nao aprovar/publicar a minuta sem revisar ou regenerar com o contexto atual.",
    });
  }

  if (snapshot.documentMemory.documentCount === 0 && Boolean(snapshot.documentMemory.summaryMaster)) {
    contradictions.push({
      severity: "low",
      title: "Resumo documental sem inventario associado",
      evidence: ["document_count = 0", "summary_master preenchido"],
      recommendedAction: "Verificar se a memoria foi importada manualmente ou se a sincronizacao documental precisa ser refeita.",
    });
  }

  const documentsByName = new Map<string, CaseBrainDocumentEvidence[]>();
  for (const document of evidence.documents || []) {
    const key = normalizeComparable(document.name);
    if (!key) continue;
    documentsByName.set(key, [...(documentsByName.get(key) || []), document]);
  }
  const duplicated = Array.from(documentsByName.values()).find((items) => items.length > 1);
  if (duplicated) {
    contradictions.push({
      severity: "low",
      title: "Possivel documento duplicado no acervo",
      evidence: duplicated.slice(0, 3).map((document) => `${document.name}${document.folderLabel ? ` em ${document.folderLabel}` : ""}`),
      recommendedAction: "Conferir se os arquivos sao versoes diferentes ou duplicidade antes de citar como prova.",
    });
  }

  const rootOrUnfoldered = (evidence.documents || []).filter((document) => !document.folderLabel || normalizeComparable(document.folderLabel).includes("raiz"));
  if (rootOrUnfoldered.length > 0) {
    contradictions.push({
      severity: "low",
      title: "Documento fora da estrutura documental esperada",
      evidence: rootOrUnfoldered.slice(0, 3).map((document) => document.name),
      recommendedAction: "Organizar o documento na subpasta correta antes de tratar o acervo como saneado.",
    });
  }

  return contradictions;
}

function buildFactMap(snapshot: LegalCaseContextSnapshot, evidence: CaseBrainEvidence): CaseBrainFactMap {
  const documentedFacts = uniqueStrings([
    snapshot.caseBrain.summaryMaster ? `Resumo do Case Brain: ${snapshot.caseBrain.summaryMaster}` : null,
    snapshot.documentMemory.summaryMaster ? `Resumo documental: ${snapshot.documentMemory.summaryMaster}` : null,
    snapshot.processTask.stageName ? `Etapa operacional registrada: ${snapshot.processTask.stageName}` : null,
    snapshot.documentMemory.documentCount > 0 ? `Acervo com ${snapshot.documentMemory.documentCount} documento(s) indexado(s).` : null,
    snapshot.firstDraft.artifactId ? `Minuta existente vinculada ao artifact ${snapshot.firstDraft.artifactId}.` : null,
    ...(evidence.documents || []).slice(0, 4).map((document) => document.excerpt
      ? `Documento ${document.name}: ${truncateLabel(document.excerpt, 140)}`
      : `Documento ${document.name}${document.documentType ? ` classificado como ${document.documentType}` : ""}.`),
    ...(evidence.movements || []).slice(0, 3).map((movement) => `Movimentacao${movement.date ? ` de ${movement.date}` : ""}: ${truncateLabel(movement.content, 140)}`),
  ]).slice(0, 6);

  const inferences = uniqueStrings([
    snapshot.caseBrain.firstActions?.[0] ? `Proximo ato inferido pelo Case Brain: ${snapshot.caseBrain.firstActions[0]}` : null,
    snapshot.firstDraft.recommendedPieceLabel ? `Peca sugerida pelo Case Brain: ${snapshot.firstDraft.recommendedPieceLabel}` : null,
    snapshot.documentMemory.freshness === "stale" ? "A memoria documental pode estar defasada." : null,
    snapshot.documentMemory.freshness === "missing" ? "A estrategia ainda depende de alimentacao documental." : null,
    (evidence.movements || []).some((movement) => movement.requiresAction) ? "Ha movimentacao recente que pode exigir providencia ou prazo." : null,
  ]).slice(0, 5);

  const hypotheses = uniqueStrings([
    !snapshot.caseBrain.summaryMaster ? "Resumo juridico mestre ainda precisa ser consolidado." : null,
    snapshot.caseBrain.validatedCaseLawReferencesCount === 0 ? "Pode faltar jurisprudencia validada para sustentar a tese." : null,
    snapshot.caseBrain.validatedLawReferencesCount === 0 ? "Pode faltar validacao normativa antes de citacao final." : null,
    snapshot.documentMemory.documentCount === 0 ? "Ainda nao ha prova documental suficiente indexada para sustentar narrativa robusta." : null,
  ]).slice(0, 5);

  return { documentedFacts, inferences, hypotheses };
}

function buildLikelyNextActs(snapshot: LegalCaseContextSnapshot, risks: CaseBrainRiskItem[], evidence: CaseBrainEvidence) {
  const mission = buildProcessMissionContext(snapshot);
  return uniqueStrings([
    ...(evidence.movements || []).map((movement) => movement.suggestedAction),
    ...stringArray(snapshot.caseBrain.firstActions),
    risks.some((risk) => risk.title.includes("Memoria documental")) ? "Sincronizar ou revalidar o acervo documental do processo." : null,
    risks.some((risk) => risk.title.includes("Pendencias")) ? "Coletar documentos pendentes antes da proxima peca." : null,
    mission.draft.recommendedPiece ? `Preparar/revisar ${mission.draft.recommendedPiece} com revisao humana obrigatoria.` : null,
    mission.status.nextStep,
  ]).slice(0, 5);
}

function resolveRecommendedAction(insights: Omit<CaseBrainInsights, "recommendedAction">) {
  if (insights.contradictions.some((item) => item.severity === "high")) return "Resolver contradicao critica antes de gerar ou aprovar peca.";
  if (insights.risks.some((item) => item.severity === "high")) return "Tratar riscos altos e pendencias documentais antes da proxima acao juridica.";
  if (insights.groundingGaps.length > 0) return "Fortalecer grounding juridico e documental antes de uso externo.";
  if (insights.likelyNextActs[0]) return insights.likelyNextActs[0];
  return "Manter acompanhamento e revisar o Case Brain quando houver nova movimentacao ou documento.";
}

export function buildCaseBrainInsights(snapshot: LegalCaseContextSnapshot, evidence: CaseBrainEvidence = {}): CaseBrainInsights {
  const mission = buildProcessMissionContext(snapshot);
  const risks = buildRisks(snapshot, evidence);
  const contradictions = buildContradictions(snapshot, evidence);
  const factMap = buildFactMap(snapshot, evidence);
  const likelyNextActs = buildLikelyNextActs(snapshot, risks, evidence);
  const groundingGaps = uniqueStrings([
    ...mission.grounding.missingSignals,
    !snapshot.caseBrain.readyForFactCitations ? "fact_citations" : null,
    !snapshot.caseBrain.readyForLawCitations ? "law_citations" : null,
    !snapshot.caseBrain.readyForCaseLawCitations ? "case_law_citations" : null,
  ]);
  const confidence = contradictions.some((item) => item.severity === "high") || risks.some((item) => item.severity === "high")
    ? "medium"
    : mission.confidence;
  const baseInsights = {
    processTaskId: snapshot.processTask.id,
    processLabel: snapshot.processTask.processNumber || snapshot.processTask.title,
    clientName: snapshot.processTask.clientName,
    currentPhase: mission.status.currentPhase,
    timeline: buildTimeline(snapshot, evidence),
    risks,
    contradictions,
    factMap,
    likelyNextActs,
    groundingGaps,
    evidence: {
      documentCount: evidence.documents?.length || 0,
      extractedDocumentCount: (evidence.documents || []).filter((document) => document.extractionStatus === "extracted").length,
      movementCount: evidence.movements?.length || 0,
    },
    confidence,
  } satisfies Omit<CaseBrainInsights, "recommendedAction">;

  return {
    ...baseInsights,
    recommendedAction: resolveRecommendedAction(baseInsights),
  };
}

export function buildCaseBrainInsightsReply(insights: CaseBrainInsights) {
  const timeline = insights.timeline.length > 0
    ? insights.timeline.map((item) => `- ${item.date ? `${item.date}: ` : ""}${item.label} (${item.source}, ${item.confidence})`)
    : ["- Nenhum marco estruturado encontrado ainda."];
  const risks = insights.risks.length > 0
    ? insights.risks.map((item) => `- [${item.severity}] ${item.title}: ${item.reason} Acao: ${item.recommendedAction}`)
    : ["- Nenhum risco alto registrado pelos sinais atuais."];
  const contradictions = insights.contradictions.length > 0
    ? insights.contradictions.map((item) => `- [${item.severity}] ${item.title}: ${item.evidence.join(" | ")}. Acao: ${item.recommendedAction}`)
    : ["- Nenhuma contradicao estrutural detectada pelos sinais atuais."];
  const nextActs = insights.likelyNextActs.length > 0
    ? insights.likelyNextActs.map((item) => `- ${item}`)
    : ["- Aguardar novo documento, movimentacao ou comando do advogado responsavel."];

  return [
    "## Case Brain 2.0",
    `- Processo: ${insights.processLabel}`,
    insights.clientName ? `- Cliente: ${insights.clientName}` : null,
    insights.currentPhase ? `- Fase atual: ${insights.currentPhase}` : null,
    `- Evidencias carregadas: ${insights.evidence.documentCount} documento(s), ${insights.evidence.movementCount} movimentacao(oes)`,
    `- Confianca: ${insights.confidence}`,
    `- Acao recomendada: ${insights.recommendedAction}`,
    "",
    "### Cronologia estruturada",
    ...timeline,
    "",
    "### Riscos",
    ...risks,
    "",
    "### Contradicoes e divergencias",
    ...contradictions,
    "",
    "### Fatos documentados",
    ...(insights.factMap.documentedFacts.length > 0 ? insights.factMap.documentedFacts.map((item) => `- ${item}`) : ["- Nenhum fato documentado consolidado."]),
    "",
    "### Inferencias e hipoteses",
    ...(insights.factMap.inferences.length > 0 ? insights.factMap.inferences.map((item) => `- Inferencia: ${item}`) : []),
    ...(insights.factMap.hypotheses.length > 0 ? insights.factMap.hypotheses.map((item) => `- Hipotese: ${item}`) : ["- Sem hipoteses relevantes pelos sinais atuais."]),
    "",
    "### Proximos atos provaveis",
    ...nextActs,
    "",
    "Guardrail: este diagnostico nao executa protocolo, publicacao, envio externo ou alteracao no Drive. Use como base para revisao humana e proxima missao supervisionada.",
  ].filter((line): line is string => line !== null).join("\n");
}
