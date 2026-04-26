import { createClient } from "@supabase/supabase-js";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import {
  filterExternalValidationReferencesForLegalArea,
  formatExternalValidationReference,
  parseExternalValidationReferencesFromMetadata,
} from "@/lib/juridico/external-validation";
import { normalizeLegalPieceRequest } from "@/lib/juridico/piece-catalog";
import { executeDraftFactoryForProcessTask } from "@/lib/lex/draft-factory";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type CaseBrainBootstrapRefs = {
  taskId: string;
  runId: string;
  stepId: string;
};

export type CaseBrainClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  asaas_customer_id: string | null;
};

export type CaseBrainCase = {
  id: string;
  status: string | null;
};

export type CaseBrainCrmTask = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  tags: string[] | null;
  phone: string | null;
  sector: string | null;
  value: number | null;
} | null;

export type CaseBrainProcessTask = {
  id: string;
  stage_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  value: number | null;
  tags: string[] | null;
  phone: string | null;
  sector: string | null;
  data_ultima_movimentacao: string | null;
  client_name?: string | null;
};

export type CaseBrainBillingArtifact = {
  id: string;
  metadata: Record<string, unknown> | null;
};

type TenantLegalProfile = {
  office_display_name: string | null;
  default_tone: string | null;
  citation_style: string | null;
  signature_block: string | null;
  metadata: Record<string, unknown> | null;
};

type ProcessDocumentSummary = {
  id: string;
  name: string;
  document_type: string | null;
  extraction_status: string | null;
  folder_label: string | null;
  modified_at: string | null;
};

type ProcessDocumentMemoryRecord = {
  summary_master?: string | null;
  missing_documents?: string[] | null;
  key_documents?: unknown;
  key_facts?: unknown;
  current_phase?: string | null;
  document_count?: number | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
  case_brain_task_id?: string | null;
  draft_plan_summary?: Record<string, unknown> | null;
  first_draft_status?: string | null;
  first_draft_task_id?: string | null;
  first_draft_artifact_id?: string | null;
  first_draft_case_brain_task_id?: string | null;
  first_draft_summary?: string | null;
  first_draft_error?: string | null;
  first_draft_generated_at?: string | null;
};

function getString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

function formatCurrency(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function loadTenantLegalProfile(tenantId: string) {
  const { data } = await serviceSupabase
    .from("tenant_legal_profiles")
    .select("office_display_name, default_tone, citation_style, signature_block, metadata")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantLegalProfile>();

  return data || null;
}

function isAutoDraftFactoryEnabled(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.auto_draft_factory_on_case_brain_ready === true;
}

async function loadProcessDocuments(tenantId: string, processTaskId: string) {
  const { data } = await serviceSupabase
    .from("process_documents")
    .select("id, name, document_type, extraction_status, folder_label, modified_at")
    .eq("tenant_id", tenantId)
    .eq("process_task_id", processTaskId)
    .order("modified_at", { ascending: false })
    .limit(8);

  return (data || []) as ProcessDocumentSummary[];
}

async function loadProcessDocumentMemory(tenantId: string, processTaskId: string) {
  const { data } = await serviceSupabase
    .from("process_document_memory")
    .select("summary_master, missing_documents, key_documents, key_facts, current_phase, document_count, sync_status, last_synced_at, case_brain_task_id, draft_plan_summary, first_draft_status, first_draft_task_id, first_draft_artifact_id, first_draft_case_brain_task_id, first_draft_summary, first_draft_error, first_draft_generated_at")
    .eq("tenant_id", tenantId)
    .eq("process_task_id", processTaskId)
    .maybeSingle<ProcessDocumentMemoryRecord>();

  return data || null;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function buildDraftPlanSummaryValue(draftPlan: {
  recommended_piece_input?: string | null;
  recommended_piece_label?: string | null;
  missing_documents?: string[] | null;
  first_actions?: string[] | null;
}, options?: {
  sourcePack?: ReturnType<typeof buildSourcePack>;
  citationChecklist?: ReturnType<typeof buildCitationChecklist>;
}) {
  const lawReferences = Array.isArray(options?.sourcePack?.validated_external_sources?.law_references)
    ? options?.sourcePack?.validated_external_sources?.law_references
    : [];
  const caseLawReferences = Array.isArray(options?.sourcePack?.validated_external_sources?.case_law_references)
    ? options?.sourcePack?.validated_external_sources?.case_law_references
    : [];
  return {
    recommended_piece_input: draftPlan.recommended_piece_input || null,
    recommended_piece_label: draftPlan.recommended_piece_label || null,
    missing_documents: Array.isArray(draftPlan.missing_documents) ? draftPlan.missing_documents : [],
    first_actions: Array.isArray(draftPlan.first_actions) ? draftPlan.first_actions : [],
    ready_for_law_citations: options?.citationChecklist?.ready_for_law_citations === true,
    ready_for_case_law_citations: options?.citationChecklist?.ready_for_case_law_citations === true,
    validated_law_reference_count: lawReferences.length,
    validated_case_law_reference_count: caseLawReferences.length,
    pending_validation_count: Array.isArray(options?.citationChecklist?.pending_validations)
      ? options?.citationChecklist?.pending_validations.length
      : 0,
  };
}

function isFirstDraftStale(memory: ProcessDocumentMemoryRecord | null, caseBrainTaskId: string) {
  if (!memory?.first_draft_artifact_id) {
    return false;
  }

  const sourceCaseBrainTaskId = memory.first_draft_case_brain_task_id;
  if (!sourceCaseBrainTaskId) {
    return true;
  }

  return sourceCaseBrainTaskId !== caseBrainTaskId;
}

function resolveFirstDraftStatus(memory: ProcessDocumentMemoryRecord | null, autoEnabled: boolean, caseBrainTaskId: string) {
  const stale = isFirstDraftStale(memory, caseBrainTaskId);

  if (memory?.first_draft_artifact_id && !stale) {
    return "completed";
  }

  if (memory?.first_draft_status === "running") {
    return "running";
  }

  if (autoEnabled && (stale || !memory?.first_draft_artifact_id || memory?.first_draft_status === "failed")) {
    return "queued";
  }

  if (memory?.first_draft_artifact_id) {
    return "completed";
  }

  return memory?.first_draft_status === "failed" ? "failed" : "idle";
}

function inferRecommendedPieceInput(params: {
  legalArea: string | null;
  documents: ProcessDocumentSummary[];
  memory: ProcessDocumentMemoryRecord | null;
}) {
  const documentTypes = new Set(params.documents.map((doc) => normalizeText(doc.document_type)));
  const currentPhase = normalizeText(params.memory?.current_phase);

  if (documentTypes.has("contestacao")) return "Replica";
  if (documentTypes.has("recurso") || currentPhase.includes("recurso")) return "Contrarrazoes de Apelacao";
  if (documentTypes.has("sentenca") || documentTypes.has("decisao") || currentPhase.includes("sentenc")) return "Apelacao";
  if (currentPhase.includes("cumprimento")) return "Impugnacao ao Cumprimento de Sentenca";
  if (params.legalArea?.toLowerCase().includes("parecer")) return "Parecer Juridico";
  return "Peticao Inicial";
}

function buildResearchPack(params: {
  legalArea: string | null;
  clientName: string;
  processTaskTitle: string;
  documents: ProcessDocumentSummary[];
  memory: ProcessDocumentMemoryRecord | null;
}) {
  const queries = buildResearchQueries({
    legalArea: params.legalArea,
    clientName: params.clientName,
    processTaskTitle: params.processTaskTitle,
    documentCount: params.documents.length,
  });

  const workstreams = [
    { key: "rito", label: "Mapear rito e competência", source: "research_query" },
    { key: "fundamentos", label: "Levantar fundamentos e precedentes usuais", source: "research_query" },
    { key: "prova", label: "Validar suficiência probatória inicial", source: "document_inventory" },
    { key: "riscos", label: "Identificar riscos processuais iniciais", source: "case_profile" },
  ];

  return {
    queries,
    workstreams,
    current_phase: params.memory?.current_phase || null,
    summary_master: params.memory?.summary_master || null,
    key_facts: Array.isArray(params.memory?.key_facts) ? params.memory?.key_facts : [],
  };
}

function buildSourcePack(params: {
  legalArea: string | null;
  documents: ProcessDocumentSummary[];
  memory: ProcessDocumentMemoryRecord | null;
  tenantProfile: TenantLegalProfile | null;
}) {
  const validatedExternalReferences = parseExternalValidationReferencesFromMetadata(params.tenantProfile?.metadata || null);
  const validatedLawReferences = filterExternalValidationReferencesForLegalArea(validatedExternalReferences.lawReferences, params.legalArea);
  const validatedCaseLawReferences = filterExternalValidationReferencesForLegalArea(validatedExternalReferences.caseLawReferences, params.legalArea);
  const validatedInternalSources = params.documents.map((doc) => ({
    id: doc.id,
    type: "internal_document",
    title: doc.name,
    document_type: doc.document_type,
    status: doc.extraction_status === "extracted" ? "validated_internal" : "partial_internal",
    can_quote_as_authority: false,
    can_quote_as_fact: true,
  }));

  const externalValidationGaps = uniqueStrings([
    validatedLawReferences.length === 0 ? `Legislação aplicável à frente ${params.legalArea || "jurídica"}.` : null,
    validatedCaseLawReferences.length === 0 ? `Precedentes e jurisprudência recentes sobre ${params.legalArea || "o caso"}.` : null,
    validatedCaseLawReferences.length === 0 ? `Entendimento dominante do tribunal competente para o caso.` : null,
  ]);

  return {
    validated_internal_sources: validatedInternalSources,
    validated_external_sources: {
      law_references: validatedLawReferences.map((reference) => ({
        id: reference.id,
        citation: reference.citation,
        title: reference.title,
        summary: reference.summary,
        source_url: reference.sourceUrl,
        legal_areas: reference.legalAreas,
        authority: reference.authority,
        validated_at: reference.validatedAt,
      })),
      case_law_references: validatedCaseLawReferences.map((reference) => ({
        id: reference.id,
        citation: reference.citation,
        title: reference.title,
        summary: reference.summary,
        source_url: reference.sourceUrl,
        legal_areas: reference.legalAreas,
        authority: reference.authority,
        validated_at: reference.validatedAt,
      })),
    },
    internal_context: {
      summary_master: params.memory?.summary_master || null,
      current_phase: params.memory?.current_phase || null,
      office_tone: params.tenantProfile?.default_tone || null,
      citation_style: params.tenantProfile?.citation_style || null,
    },
    external_validation_gaps: externalValidationGaps,
  };
}

function buildCitationChecklist(params: {
  sourcePack: ReturnType<typeof buildSourcePack>;
  draftPieceInput: string;
  memory: ProcessDocumentMemoryRecord | null;
}) {
  const validatedLawReferences = Array.isArray(params.sourcePack.validated_external_sources?.law_references)
    ? params.sourcePack.validated_external_sources.law_references
    : [];
  const validatedCaseLawReferences = Array.isArray(params.sourcePack.validated_external_sources?.case_law_references)
    ? params.sourcePack.validated_external_sources.case_law_references
    : [];
  const validatedFacts = params.sourcePack.validated_internal_sources.length > 0
    ? ["Narrativa fática pode usar documentos internos já sincronizados."]
    : ["Narrativa fática depende de intake documental adicional."];

  return {
    draft_piece_input: params.draftPieceInput,
    ready_for_fact_citations: params.sourcePack.validated_internal_sources.length > 0,
    ready_for_law_citations: validatedLawReferences.length > 0,
    ready_for_case_law_citations: validatedCaseLawReferences.length > 0,
    fact_citation_basis: validatedFacts,
    law_citation_basis: validatedLawReferences.map((reference) => formatExternalValidationReference({
      id: String(reference.id || ""),
      kind: "law",
      citation: String(reference.citation || reference.title || "").trim(),
      title: String(reference.title || reference.citation || "").trim(),
      summary: typeof reference.summary === "string" ? reference.summary : null,
      sourceUrl: typeof reference.source_url === "string" ? reference.source_url : null,
      legalAreas: Array.isArray(reference.legal_areas) ? reference.legal_areas.filter((item): item is string => typeof item === "string") : [],
      authority: typeof reference.authority === "string" ? reference.authority : null,
      validatedAt: typeof reference.validated_at === "string" ? reference.validated_at : null,
    })),
    case_law_citation_basis: validatedCaseLawReferences.map((reference) => formatExternalValidationReference({
      id: String(reference.id || ""),
      kind: "case_law",
      citation: String(reference.citation || reference.title || "").trim(),
      title: String(reference.title || reference.citation || "").trim(),
      summary: typeof reference.summary === "string" ? reference.summary : null,
      sourceUrl: typeof reference.source_url === "string" ? reference.source_url : null,
      legalAreas: Array.isArray(reference.legal_areas) ? reference.legal_areas.filter((item): item is string => typeof item === "string") : [],
      authority: typeof reference.authority === "string" ? reference.authority : null,
      validatedAt: typeof reference.validated_at === "string" ? reference.validated_at : null,
    })),
    pending_validations: params.sourcePack.external_validation_gaps,
    summary_master_available: Boolean(params.memory?.summary_master),
  };
}

function buildDraftPlan(params: {
  legalArea: string | null;
  documents: ProcessDocumentSummary[];
  memory: ProcessDocumentMemoryRecord | null;
}) {
  const recommendedPieceInput = inferRecommendedPieceInput({
    legalArea: params.legalArea,
    documents: params.documents,
    memory: params.memory,
  });
  const normalizedPiece = normalizeLegalPieceRequest(recommendedPieceInput);

  const availableDocumentTypes = uniqueStrings(params.documents.map((doc) => doc.document_type));
  const missingDocuments = uniqueStrings([
    ...(Array.isArray(params.memory?.missing_documents) ? params.memory?.missing_documents : []),
    ...normalizedPiece.requirements
      .filter((requirement) => !requirement.acceptedDocumentTypes.some((type) => availableDocumentTypes.includes(type)))
      .map((requirement) => requirement.label),
  ]);

  return {
    recommended_piece_input: recommendedPieceInput,
    recommended_piece_label: normalizedPiece.pieceLabel,
    recommended_piece_family: normalizedPiece.familyKey,
    quality_profile: normalizedPiece.qualityProfile,
    required_documents: normalizedPiece.requirements,
    available_document_types: availableDocumentTypes,
    missing_documents: missingDocuments,
    first_actions: [
      `Validar a peça inicial sugerida: ${normalizedPiece.pieceLabel}.`,
      "Checar as pendências documentais antes da primeira minuta.",
      "Executar pesquisa e validação de fontes antes de redigir citações normativas ou jurisprudenciais.",
    ],
  };
}

function buildResearchQueries(params: {
  legalArea: string | null;
  clientName: string;
  processTaskTitle: string;
  documentCount: number;
}) {
  const legalArea = params.legalArea || "frente jurídica do caso";
  const queries = [
    `Mapear rito, competência e pedidos típicos de ${legalArea}.`,
    `Listar precedentes e fundamentos usuais para ${legalArea}.`,
    `Identificar documentos essenciais para ajuizamento ou resposta inicial em ${legalArea}.`,
    `Definir riscos de prova, prescrição/decadência e urgência processual para ${params.clientName}.`,
  ];

  if (params.documentCount === 0) {
    queries.unshift(`Definir checklist mínimo de documentos faltantes para ${params.processTaskTitle}.`);
  }

  return queries;
}

function buildEvidenceChecklist(params: {
  legalArea: string | null;
  documents: ProcessDocumentSummary[];
}) {
  const checklist = [
    "Documento de identificação do cliente.",
    "Provas centrais do fato narrado.",
    "Comunicações, contratos ou notificações relacionadas.",
  ];

  if (params.legalArea?.toLowerCase().includes("previd")) {
    checklist.push("CNIS, PPP e documentos contributivos relevantes.");
  }

  if (params.legalArea?.toLowerCase().includes("trabalh")) {
    checklist.push("CTPS, holerites, cartões de ponto e comunicações internas.");
  }

  if (params.documents.length > 0) {
    checklist.push(`Documentos já sincronizados: ${params.documents.map((doc) => doc.name).join(", ")}.`);
  }

  return checklist;
}

function buildInitialNextSteps(params: {
  clientName: string;
  legalArea: string | null;
  documentCount: number;
}) {
  const steps = [
    `Confirmar o objetivo jurídico e a tese principal para ${params.clientName}.`,
    "Validar competência, rito e urgências processuais.",
    "Preparar plano de pesquisa jurídica e minuta inicial supervisionada.",
  ];

  if (params.documentCount === 0) {
    steps.unshift("Solicitar e organizar os documentos essenciais antes da primeira minuta.");
  }

  if (params.legalArea) {
    steps.push(`Ajustar a estratégia específica para a frente ${params.legalArea}.`);
  }

  return steps;
}

function buildCaseBrainPackage(params: {
  client: CaseBrainClient;
  clientName: string;
  caseRecord: CaseBrainCase;
  crmTask: CaseBrainCrmTask;
  processTask: CaseBrainProcessTask;
  billingArtifact: CaseBrainBillingArtifact;
  saleId: string;
  legalArea: string | null;
  amount: number | null;
  tenantProfile: TenantLegalProfile | null;
  documents: ProcessDocumentSummary[];
  memory: ProcessDocumentMemoryRecord | null;
}) {
  const amountFormatted = formatCurrency(params.amount);
  const researchPack = buildResearchPack({
    legalArea: params.legalArea,
    clientName: params.clientName,
    processTaskTitle: params.processTask.title,
    documents: params.documents,
    memory: params.memory,
  });
  const researchQueries = researchPack.queries;
  const evidenceChecklist = buildEvidenceChecklist({ legalArea: params.legalArea, documents: params.documents });
  const nextSteps = buildInitialNextSteps({
    clientName: params.clientName,
    legalArea: params.legalArea,
    documentCount: params.documents.length,
  });
  const sourcePack = buildSourcePack({
    legalArea: params.legalArea,
    documents: params.documents,
    memory: params.memory,
    tenantProfile: params.tenantProfile,
  });
  const draftPlan = buildDraftPlan({
    legalArea: params.legalArea,
    documents: params.documents,
    memory: params.memory,
  });
  const citationChecklist = buildCitationChecklist({
    sourcePack,
    draftPieceInput: draftPlan.recommended_piece_input,
    memory: params.memory,
  });

  const legalReadiness = {
    legal_area: params.legalArea,
    document_count: params.documents.length,
    has_synced_documents: params.documents.length > 0,
    requires_document_intake: params.documents.length === 0,
    tone: params.tenantProfile?.default_tone || null,
    citation_style: params.tenantProfile?.citation_style || null,
  };

  const dossier = {
    client_profile: {
      id: params.client.id,
      name: params.clientName,
      email: params.client.email,
      phone: params.client.phone,
      asaas_customer_id: params.client.asaas_customer_id,
    },
    case_profile: {
      id: params.caseRecord.id,
      status: params.caseRecord.status || "Ativo",
      legal_area: params.legalArea,
      title: params.processTask.title,
      operational_task_id: params.processTask.id,
    },
    commercial_origin: {
      crm_task_id: params.crmTask?.id || null,
      crm_title: params.crmTask?.title || null,
      sale_id: params.saleId,
      closed_value: params.amount,
      closed_value_formatted: amountFormatted,
    },
    billing: {
      billing_artifact_id: params.billingArtifact.id,
      due_date: getString(params.billingArtifact.metadata, "vencimento"),
      payment_link: getString(params.billingArtifact.metadata, "payment_link") || getString(params.billingArtifact.metadata, "invoice_url"),
      installments: getNumber(params.billingArtifact.metadata, "parcelas"),
    },
    legal_profile: {
      office_display_name: params.tenantProfile?.office_display_name || null,
      default_tone: params.tenantProfile?.default_tone || null,
      citation_style: params.tenantProfile?.citation_style || null,
      signature_block: params.tenantProfile?.signature_block || null,
    },
    document_inventory: {
      total_documents: params.documents.length,
      latest_documents: params.documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        document_type: doc.document_type,
        extraction_status: doc.extraction_status,
        folder_label: doc.folder_label,
      })),
      summary_master: params.memory?.summary_master || null,
      current_phase: params.memory?.current_phase || null,
    },
    legal_readiness: legalReadiness,
    research_queries: researchQueries,
    evidence_checklist: evidenceChecklist,
    next_steps: nextSteps,
  };

  const dossierMarkdown = [
    `# Case Brain Inicial`,
    `## Cliente`,
    `- Nome: ${params.clientName}`,
    params.client.email ? `- Email: ${params.client.email}` : null,
    params.client.phone ? `- Telefone: ${params.client.phone}` : null,
    ``,
    `## Caso`,
    `- Case ID: ${params.caseRecord.id}`,
    `- Status: ${params.caseRecord.status || "Ativo"}`,
    params.legalArea ? `- Frente jurídica: ${params.legalArea}` : null,
    amountFormatted ? `- Valor fechado: ${amountFormatted}` : null,
    ``,
    `## Origem comercial`,
    params.crmTask?.title ? `- Oportunidade: ${params.crmTask.title}` : null,
    params.crmTask?.id ? `- CRM Task ID: ${params.crmTask.id}` : null,
    `- Sale ID: ${params.saleId}`,
    ``,
    `## Prontidão jurídica`,
    `- Documentos sincronizados: ${params.documents.length}`,
    legalReadiness.requires_document_intake ? `- Atenção: intake documental ainda pendente.` : `- Base documental inicial disponível.`,
    params.tenantProfile?.default_tone ? `- Tom padrão do escritório: ${params.tenantProfile.default_tone}` : null,
    params.tenantProfile?.citation_style ? `- Estilo de citação: ${params.tenantProfile.citation_style}` : null,
    ``,
    `## Próximos passos sugeridos`,
    ...nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => Boolean(line)).join("\n");

  const sourcePackMarkdown = [
    `# Source Pack Inicial`,
    `## Fontes internas validadas`,
    ...(sourcePack.validated_internal_sources.length > 0
      ? sourcePack.validated_internal_sources.map((source) => `- ${source.title} (${source.document_type || "geral"}) - ${source.status}`)
      : ["- Nenhum documento interno extraído com qualidade suficiente até agora."]),
    ``,
    `## Lacunas que exigem validação humana`,
    ...sourcePack.external_validation_gaps.map((item) => `- ${item}`),
  ].join("\n");

  const draftPlanMarkdown = [
    `# Draft Plan Jurídico Inicial`,
    `## Peça sugerida`,
    `- Peça: ${draftPlan.recommended_piece_label}`,
    `- Família: ${draftPlan.recommended_piece_family}`,
    ``,
    `## Documentos exigidos`,
    ...draftPlan.required_documents.map((requirement) => `- ${requirement.label}`),
    ``,
    `## Pendências atuais`,
    ...(draftPlan.missing_documents.length > 0 ? draftPlan.missing_documents.map((item) => `- ${item}`) : ["- Sem pendências críticas de documentos nesta etapa."]),
    ``,
    `## Primeiras ações`,
    ...draftPlan.first_actions.map((action) => `- ${action}`),
  ].join("\n");

  const planMarkdown = [
    `# Plano Inicial do Case Brain`,
    `## Trilhas de pesquisa`,
    ...researchQueries.map((query) => `- ${query}`),
    ``,
    `## Checklist probatório`,
    ...evidenceChecklist.map((item) => `- ${item}`),
    ``,
    `## Ações imediatas do MAYUS Lex`,
    ...nextSteps.map((item) => `- ${item}`),
  ].join("\n");

  return {
    dossier,
    dossierMarkdown,
    plan: {
      legal_readiness: legalReadiness,
      research_queries: researchQueries,
      evidence_checklist: evidenceChecklist,
      next_steps: nextSteps,
    },
    planMarkdown,
    researchPack,
    sourcePack,
    sourcePackMarkdown,
    citationChecklist,
    draftPlan,
    draftPlanMarkdown,
  };
}

export async function executeCaseBrainBootstrapFlow(params: {
  tenantId: string;
  refs: CaseBrainBootstrapRefs;
  client: CaseBrainClient;
  clientName: string;
  caseRecord: CaseBrainCase;
  crmTask: CaseBrainCrmTask;
  processTask: CaseBrainProcessTask;
  billingArtifact: CaseBrainBillingArtifact;
  saleId: string;
  legalArea: string | null;
  amount: number | null;
}) {
  const { data: existingDossier } = await serviceSupabase
    .from("brain_artifacts")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("task_id", params.refs.taskId)
    .eq("artifact_type", "case_brain_dossier")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingDossier?.id) {
    return;
  }

  const startedAt = new Date().toISOString();
  await Promise.all([
    serviceSupabase.from("brain_tasks").update({ status: "executing", started_at: startedAt }).eq("id", params.refs.taskId),
    serviceSupabase.from("brain_runs").update({ status: "executing", started_at: startedAt }).eq("id", params.refs.runId),
    serviceSupabase.from("brain_steps").update({ status: "running", started_at: startedAt }).eq("id", params.refs.stepId),
  ]);

  try {
    const [tenantProfile, documents, memory] = await Promise.all([
      loadTenantLegalProfile(params.tenantId),
      loadProcessDocuments(params.tenantId, params.processTask.id),
      loadProcessDocumentMemory(params.tenantId, params.processTask.id),
    ]);

    const bootstrap = buildCaseBrainPackage({
      client: params.client,
      clientName: params.clientName,
      caseRecord: params.caseRecord,
      crmTask: params.crmTask,
      processTask: params.processTask,
      billingArtifact: params.billingArtifact,
      saleId: params.saleId,
      legalArea: params.legalArea,
      amount: params.amount,
      tenantProfile,
      documents,
      memory,
    });

    const memories = [
      { memory_type: "case_profile", memory_key: `${params.caseRecord.id}:profile`, value: bootstrap.dossier.case_profile },
      { memory_type: "client_profile", memory_key: `${params.caseRecord.id}:client`, value: bootstrap.dossier.client_profile },
      { memory_type: "commercial_origin", memory_key: `${params.caseRecord.id}:commercial`, value: bootstrap.dossier.commercial_origin },
      { memory_type: "document_inventory", memory_key: `${params.caseRecord.id}:documents`, value: bootstrap.dossier.document_inventory },
      { memory_type: "legal_bootstrap_plan", memory_key: `${params.caseRecord.id}:plan`, value: bootstrap.plan },
      { memory_type: "legal_research_pack", memory_key: `${params.caseRecord.id}:research`, value: bootstrap.researchPack },
      { memory_type: "validated_source_pack", memory_key: `${params.caseRecord.id}:sources`, value: { source_pack: bootstrap.sourcePack, citation_checklist: bootstrap.citationChecklist } },
      { memory_type: "draft_plan", memory_key: `${params.caseRecord.id}:draft-plan`, value: bootstrap.draftPlan },
    ];

    const { data: insertedMemories, error: memoryError } = await serviceSupabase
      .from("brain_memories")
      .insert(
        memories.map((memory) => ({
          tenant_id: params.tenantId,
          task_id: params.refs.taskId,
          run_id: params.refs.runId,
          scope: "case",
          memory_type: memory.memory_type,
          memory_key: memory.memory_key,
          value: memory.value,
          source: "revenue_to_case",
          confidence: 0.92,
          promoted: true,
          created_by: null,
        }))
      )
      .select("id, memory_type");

    if (memoryError || !insertedMemories) {
      throw memoryError || new Error("Nao foi possivel registrar as memorias estruturadas do caso.");
    }

    const memoriesByType = Object.fromEntries(insertedMemories.map((item) => [item.memory_type, item.id]));

    await Promise.all([
      createBrainArtifact({
        tenantId: params.tenantId,
        taskId: params.refs.taskId,
        runId: params.refs.runId,
        stepId: params.refs.stepId,
        artifactType: "case_brain_dossier",
        title: `Dossiê inicial - ${params.clientName}`,
        mimeType: "text/markdown",
        dedupeKey: `case-brain-dossier:${params.caseRecord.id}`,
        metadata: {
          reply: bootstrap.dossierMarkdown,
          case_id: params.caseRecord.id,
          client_id: params.client.id,
          process_task_id: params.processTask.id,
          crm_task_id: params.crmTask?.id || null,
          sale_id: params.saleId,
          dossier: bootstrap.dossier,
          memory_refs: memoriesByType,
        },
      }),
      createBrainArtifact({
        tenantId: params.tenantId,
        taskId: params.refs.taskId,
        runId: params.refs.runId,
        stepId: params.refs.stepId,
        artifactType: "case_brain_plan",
        title: `Plano inicial - ${params.clientName}`,
        mimeType: "text/markdown",
        dedupeKey: `case-brain-plan:${params.caseRecord.id}`,
        metadata: {
          reply: bootstrap.planMarkdown,
          case_id: params.caseRecord.id,
          client_id: params.client.id,
          process_task_id: params.processTask.id,
          plan: bootstrap.plan,
        },
      }),
      createBrainArtifact({
        tenantId: params.tenantId,
        taskId: params.refs.taskId,
        runId: params.refs.runId,
        stepId: params.refs.stepId,
        artifactType: "case_research_pack",
        title: `Research pack - ${params.clientName}`,
        mimeType: "application/json",
        dedupeKey: `case-research-pack:${params.caseRecord.id}`,
        metadata: {
          reply: bootstrap.planMarkdown,
          case_id: params.caseRecord.id,
          client_id: params.client.id,
          process_task_id: params.processTask.id,
          research_pack: bootstrap.researchPack,
        },
      }),
      createBrainArtifact({
        tenantId: params.tenantId,
        taskId: params.refs.taskId,
        runId: params.refs.runId,
        stepId: params.refs.stepId,
        artifactType: "case_source_pack",
        title: `Source pack - ${params.clientName}`,
        mimeType: "text/markdown",
        dedupeKey: `case-source-pack:${params.caseRecord.id}`,
        metadata: {
          reply: bootstrap.sourcePackMarkdown,
          case_id: params.caseRecord.id,
          client_id: params.client.id,
          process_task_id: params.processTask.id,
          source_pack: bootstrap.sourcePack,
          citation_checklist: bootstrap.citationChecklist,
        },
      }),
      createBrainArtifact({
        tenantId: params.tenantId,
        taskId: params.refs.taskId,
        runId: params.refs.runId,
        stepId: params.refs.stepId,
        artifactType: "case_draft_plan",
        title: `Draft plan - ${params.clientName}`,
        mimeType: "text/markdown",
        dedupeKey: `case-draft-plan:${params.caseRecord.id}`,
        metadata: {
          reply: bootstrap.draftPlanMarkdown,
          case_id: params.caseRecord.id,
          client_id: params.client.id,
          process_task_id: params.processTask.id,
          draft_plan: bootstrap.draftPlan,
        },
      }),
    ]);

    const completedAt = new Date().toISOString();
    const resultSummary = `Case Brain inicial criado para ${params.clientName}. Dossiê, pesquisa, source pack e draft plan já disponíveis.`;

    await Promise.all([
      serviceSupabase
        .from("brain_steps")
        .update({
          status: "completed",
          output_payload: {
            case_id: params.caseRecord.id,
            client_id: params.client.id,
            process_task_id: params.processTask.id,
            sale_id: params.saleId,
            summary: resultSummary,
            memory_refs: memoriesByType,
            recommended_piece: bootstrap.draftPlan.recommended_piece_label,
          },
          completed_at: completedAt,
        })
        .eq("id", params.refs.stepId),
      serviceSupabase
        .from("brain_runs")
        .update({ status: "completed", summary: resultSummary, completed_at: completedAt })
        .eq("id", params.refs.runId),
      serviceSupabase
        .from("brain_tasks")
        .update({ status: "completed", result_summary: resultSummary, completed_at: completedAt })
        .eq("id", params.refs.taskId),
      serviceSupabase.from("learning_events").insert([
        {
          tenant_id: params.tenantId,
          task_id: params.refs.taskId,
          run_id: params.refs.runId,
          step_id: params.refs.stepId,
          event_type: "case_brain_bootstrap_completed",
          source_module: "lex",
          payload: {
            case_id: params.caseRecord.id,
            client_id: params.client.id,
            process_task_id: params.processTask.id,
            sale_id: params.saleId,
            summary: resultSummary,
          },
          created_by: null,
        },
        {
          tenant_id: params.tenantId,
          task_id: params.refs.taskId,
          run_id: params.refs.runId,
          step_id: params.refs.stepId,
          event_type: "case_brain_plan_ready",
          source_module: "lex",
          payload: {
            case_id: params.caseRecord.id,
            research_queries: bootstrap.plan.research_queries,
            next_steps: bootstrap.plan.next_steps,
          },
          created_by: null,
        },
        {
          tenant_id: params.tenantId,
          task_id: params.refs.taskId,
          run_id: params.refs.runId,
          step_id: params.refs.stepId,
          event_type: "case_brain_research_ready",
          source_module: "lex",
          payload: {
            case_id: params.caseRecord.id,
            research_queries: bootstrap.researchPack.queries,
            summary_master: bootstrap.researchPack.summary_master,
          },
          created_by: null,
        },
        {
          tenant_id: params.tenantId,
          task_id: params.refs.taskId,
          run_id: params.refs.runId,
          step_id: params.refs.stepId,
          event_type: "case_brain_sources_validated",
          source_module: "lex",
          payload: {
            case_id: params.caseRecord.id,
            ready_for_fact_citations: bootstrap.citationChecklist.ready_for_fact_citations,
            ready_for_law_citations: bootstrap.citationChecklist.ready_for_law_citations,
            ready_for_case_law_citations: bootstrap.citationChecklist.ready_for_case_law_citations,
          },
          created_by: null,
        },
        {
          tenant_id: params.tenantId,
          task_id: params.refs.taskId,
          run_id: params.refs.runId,
          step_id: params.refs.stepId,
          event_type: "case_brain_draft_plan_ready",
          source_module: "lex",
          payload: {
            case_id: params.caseRecord.id,
            recommended_piece_input: bootstrap.draftPlan.recommended_piece_input,
            recommended_piece_label: bootstrap.draftPlan.recommended_piece_label,
            missing_documents: bootstrap.draftPlan.missing_documents,
          },
          created_by: null,
        },
      ]),
    ]);

    const autoDraftEnabled = isAutoDraftFactoryEnabled(tenantProfile?.metadata);
    const nextFirstDraftStatus = resolveFirstDraftStatus(memory, autoDraftEnabled, params.refs.taskId);
    const shouldClearFirstDraftTaskRef = nextFirstDraftStatus !== "running" && !memory?.first_draft_artifact_id;

    const { error: memorySnapshotError } = await serviceSupabase
      .from("process_document_memory")
      .upsert(
        {
          tenant_id: params.tenantId,
          process_task_id: params.processTask.id,
          current_phase: params.processTask.stage_id || memory?.current_phase || null,
          case_brain_task_id: params.refs.taskId,
          draft_plan_summary: buildDraftPlanSummaryValue(bootstrap.draftPlan, {
            sourcePack: bootstrap.sourcePack,
            citationChecklist: bootstrap.citationChecklist,
          }),
          first_draft_status: nextFirstDraftStatus,
          first_draft_task_id: shouldClearFirstDraftTaskRef ? null : memory?.first_draft_task_id || null,
          first_draft_artifact_id: memory?.first_draft_artifact_id || null,
          first_draft_case_brain_task_id: memory?.first_draft_case_brain_task_id || null,
          first_draft_summary: memory?.first_draft_artifact_id ? memory?.first_draft_summary || null : null,
          first_draft_error: nextFirstDraftStatus === "queued" || nextFirstDraftStatus === "idle" ? null : memory?.first_draft_error || null,
          first_draft_generated_at: memory?.first_draft_artifact_id ? memory?.first_draft_generated_at || null : null,
        },
        { onConflict: "process_task_id" }
      );

    if (memorySnapshotError) {
      throw memorySnapshotError;
    }
  } catch (error: any) {
    const completedAt = new Date().toISOString();
    const errorMessage = error?.message || "Falha ao montar o Case Brain inicial.";

    await Promise.all([
      serviceSupabase
        .from("brain_steps")
        .update({ status: "failed", error_payload: { error: errorMessage }, completed_at: completedAt })
        .eq("id", params.refs.stepId),
      serviceSupabase
        .from("brain_runs")
        .update({ status: "failed", error_message: errorMessage, completed_at: completedAt })
        .eq("id", params.refs.runId),
      serviceSupabase
        .from("brain_tasks")
        .update({ status: "failed", error_message: errorMessage, completed_at: completedAt })
        .eq("id", params.refs.taskId),
      serviceSupabase.from("learning_events").insert({
        tenant_id: params.tenantId,
        task_id: params.refs.taskId,
        run_id: params.refs.runId,
        step_id: params.refs.stepId,
        event_type: "case_brain_bootstrap_failed",
        source_module: "lex",
        payload: {
          case_id: params.caseRecord.id,
          client_id: params.client.id,
          error: errorMessage,
        },
        created_by: null,
      }),
    ]);

    throw error;
  }
}
