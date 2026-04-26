import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export type PlaywrightDocumentFixtureScenario =
  | "formal_history"
  | "first_draft_failed"
  | "first_draft_retry_completed"
  | "first_draft_stale"
  | "first_draft_regenerated";

type DraftFactoryExecutionPayload = {
  draftFactoryTaskId: string;
  runId: string;
  stepId: string;
  artifactId: string;
  caseBrainTaskId: string;
  recommendedPieceInput: string;
  recommendedPieceLabel: string;
  result: {
    pieceType: string;
    pieceLabel: string;
    pieceFamily: string;
    pieceFamilyLabel: string;
    practiceArea: string | null;
    outline: string[];
    draftMarkdown: string;
    usedDocuments: Array<{
      id: string;
      name: string;
      documentType: string | null;
      folderLabel: string | null;
      webViewLink: string | null;
      modifiedAt: string | null;
    }>;
    missingDocuments: string[];
    warnings: string[];
    confidenceNote: string;
    requiresHumanReview: boolean;
    model: string;
    provider: string;
    expansionApplied: boolean;
    qualityMetrics: {
      charCount: number;
      wordCount: number;
      paragraphCount: number;
      sectionCount: number;
    };
  };
};

export type FixtureInfo = {
  scenario: PlaywrightDocumentFixtureScenario;
  tenantId: string;
  processTaskId: string;
  processTitle: string;
  currentDraftVersionId: string | null;
  publishedDraftVersionId: string | null;
  staleDraftVersionId: string | null;
  currentCaseBrainTaskId: string;
  previousCaseBrainTaskId: string;
  firstDraftArtifactId: string | null;
  draftFactoryExecution: DraftFactoryExecutionPayload | null;
};

const FIXTURE_IDS = {
  processTaskId: "11111111-1111-4111-8111-111111111111",
  documentId: "11111111-1111-4111-8111-111111111112",
  publishedDraftVersionId: "11111111-1111-4111-8111-111111111113",
  formalCurrentDraftVersionId: "11111111-1111-4111-8111-111111111114",
  retryDraftVersionId: "11111111-1111-4111-8111-111111111115",
  staleDraftVersionId: "11111111-1111-4111-8111-111111111116",
  regeneratedDraftVersionId: "11111111-1111-4111-8111-111111111117",
  currentCaseBrainTaskId: "11111111-1111-4111-8111-111111111118",
  previousCaseBrainTaskId: "11111111-1111-4111-8111-111111111119",
  currentFirstDraftTaskId: "11111111-1111-4111-8111-111111111120",
  staleFirstDraftTaskId: "11111111-1111-4111-8111-111111111121",
  currentFirstDraftArtifactId: "11111111-1111-4111-8111-111111111122",
  staleFirstDraftArtifactId: "11111111-1111-4111-8111-111111111123",
  currentDraftPlanMemoryId: "11111111-1111-4111-8111-111111111124",
  currentResearchMemoryId: "11111111-1111-4111-8111-111111111125",
  currentValidatedSourcePackMemoryId: "11111111-1111-4111-8111-111111111126",
  previousDraftPlanMemoryId: "11111111-1111-4111-8111-111111111127",
  previousResearchMemoryId: "11111111-1111-4111-8111-111111111128",
  previousValidatedSourcePackMemoryId: "11111111-1111-4111-8111-111111111129",
} as const;

const FIXTURE_TITLE = "E2E HISTORICO FORMAL MAYUS";
const FIXTURE_CASE_ID = "playwright-case-brain-e2e-documentos";
const FIXTURE_PIECE_INPUT = "Contestação";
const FIXTURE_PIECE_LABEL = "Contestação Previdenciária";
const FIXTURE_DOCUMENT_LINK = "https://drive.google.com/file/d/playwright-e2e-document-1/view";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {} as Record<string, string>;

  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function resolveFixtureTenantId(supabase: any, env: Record<string, string>) {
  const envTenantId = env.PLAYWRIGHT_TENANT_ID?.trim();
  if (envTenantId) return envTenantId;

  const email = env.PLAYWRIGHT_EMAIL?.trim();
  if (email) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const users = Array.isArray((data as { users?: Array<{ email?: string | null; app_metadata?: Record<string, unknown> | null }> } | null)?.users)
      ? (data as { users: Array<{ email?: string | null; app_metadata?: Record<string, unknown> | null }> }).users
      : [];
    const user = users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    const tenantId = typeof user?.app_metadata?.tenant_id === "string" ? user.app_metadata.tenant_id : null;
    if (tenantId) return tenantId;
  }

  return "a0000000-0000-0000-0000-000000000001";
}

async function resolvePipelineAndStage(supabase: any, tenantId: string) {
  const { data: pipelines, error: pipelinesError } = await supabase
    .from("process_pipelines")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(10);

  if (pipelinesError) throw pipelinesError;
  const pipelineRows = (pipelines || []) as Array<{ id: string; name: string }>;
  const pipeline = pipelineRows[0];
  if (!pipeline) throw new Error("Nenhum pipeline de processos encontrado para o tenant E2E.");

  const { data: stages, error: stagesError } = await supabase
    .from("process_stages")
    .select("id, pipeline_id, name, order_index")
    .eq("pipeline_id", pipeline.id)
    .order("order_index", { ascending: true })
    .limit(20);

  if (stagesError) throw stagesError;
  const stageRows = (stages || []) as Array<{ id: string; pipeline_id: string; name: string; order_index: number }>;
  const stage = stageRows.find((item) => normalizeText(item.name).includes("contest")) || stageRows[0];
  if (!stage) throw new Error("Nenhum estágio de processos encontrado para o tenant E2E.");

  return { pipelineId: pipeline.id, stageId: stage.id };
}

function buildUsedDocuments(nowIso: string) {
  return [
    {
      id: FIXTURE_IDS.documentId,
      name: "contestacao-previdenciaria-e2e.pdf",
      document_type: "contestacao",
      folder_label: "03-Contestacao",
      web_view_link: FIXTURE_DOCUMENT_LINK,
      modified_at: nowIso,
    },
  ];
}

function buildUsedDocumentsForResult(nowIso: string) {
  return [
    {
      id: FIXTURE_IDS.documentId,
      name: "contestacao-previdenciaria-e2e.pdf",
      documentType: "contestacao",
      folderLabel: "03-Contestacao",
      webViewLink: FIXTURE_DOCUMENT_LINK,
      modifiedAt: nowIso,
    },
  ];
}

function buildDraftPlanSummary() {
  return {
    recommended_piece_input: FIXTURE_PIECE_INPUT,
    recommended_piece_label: FIXTURE_PIECE_LABEL,
    missing_documents: [],
    first_actions: ["Revisar a minuta, aprovar a versão atual e publicar a peça oficial."],
    ready_for_law_citations: true,
    ready_for_case_law_citations: true,
    validated_law_reference_count: 2,
    validated_case_law_reference_count: 1,
    pending_validation_count: 0,
  };
}

function buildValidatedSourcePack(nowIso: string) {
  return {
    source_pack: {
      validated_internal_sources: [
        {
          id: FIXTURE_IDS.documentId,
          type: "internal_document",
          title: "contestacao-previdenciaria-e2e.pdf",
          document_type: "contestacao",
          status: "validated_internal",
          can_quote_as_authority: false,
          can_quote_as_fact: true,
          modified_at: nowIso,
        },
      ],
      validated_external_sources: {
        law_references: [
          { id: "law-1", citation: "CPC, art. 300", title: "Tutela de urgência", summary: "Tutela de urgência", source_url: "https://example.com/cpc300" },
          { id: "law-2", citation: "Lei 8.213/91", title: "Benefícios previdenciários", summary: "Benefícios previdenciários", source_url: "https://example.com/lei8213" },
        ],
        case_law_references: [
          { id: "case-1", citation: "Tema 1102/STJ", title: "Revisão da vida toda", summary: "Revisão da vida toda", source_url: "https://example.com/tema1102" },
        ],
      },
      external_validation_gaps: [],
      internal_context: {
        summary_master: "Caso previdenciário com minuta pronta para revisão formal do escritório.",
        current_phase: "Contestação",
        office_tone: "Técnico e objetivo",
        citation_style: "formal",
      },
    },
    citation_checklist: {
      ready_for_fact_citations: true,
      ready_for_law_citations: true,
      ready_for_case_law_citations: true,
      pending_validations: [],
      fact_citation_basis: ["documentos internos validados"],
      law_citation_basis: ["CPC, art. 300", "Lei 8.213/91"],
      case_law_citation_basis: ["Tema 1102/STJ"],
    },
  };
}

function buildDraftArtifactMetadata(params: {
  caseBrainTaskId: string;
  nowIso: string;
  draftMarkdown: string;
  summary: string;
  provider: string;
  model: string;
  memoryRefs: Record<string, string>;
}) {
  return {
    reply: params.draftMarkdown,
    case_id: FIXTURE_CASE_ID,
    process_task_id: FIXTURE_IDS.processTaskId,
    case_brain_task_id: params.caseBrainTaskId,
    recommended_piece_input: FIXTURE_PIECE_INPUT,
    recommended_piece_label: FIXTURE_PIECE_LABEL,
    piece_type: "contestacao",
    piece_label: FIXTURE_PIECE_LABEL,
    piece_family: "peca_juridica",
    piece_family_label: "Peça Jurídica",
    practice_area: "Previdenciário",
    outline: ["Síntese", "Fundamentos", "Pedidos"],
    used_documents: buildUsedDocumentsForResult(params.nowIso),
    validated_law_references: [
      { citation: "CPC, art. 300", summary: "Tutela de urgência", source_url: "https://example.com/cpc300" },
      { citation: "Lei 8.213/91", summary: "Benefícios previdenciários", source_url: "https://example.com/lei8213" },
    ],
    validated_case_law_references: [
      { citation: "Tema 1102/STJ", summary: "Revisão da vida toda", source_url: "https://example.com/tema1102" },
    ],
    missing_documents: [],
    warnings: [],
    confidence_note: params.summary,
    requires_human_review: true,
    expansion_applied: false,
    quality_metrics: {
      charCount: 1480,
      wordCount: 228,
      paragraphCount: 10,
      sectionCount: 4,
    },
    provider: params.provider,
    model: params.model,
    memory_refs: params.memoryRefs,
  };
}

function buildVersionMetadata(params: {
  nowIso: string;
  provider: string;
  model: string;
  artifactId: string | null;
  extraMetadata?: Record<string, unknown>;
}) {
  return {
    artifact_id: params.artifactId,
    recommended_piece_input: FIXTURE_PIECE_INPUT,
    recommended_piece_label: FIXTURE_PIECE_LABEL,
    used_documents: buildUsedDocuments(params.nowIso),
    quality_metrics: {
      charCount: 1480,
      wordCount: 228,
      paragraphCount: 10,
      sectionCount: 4,
    },
    warnings: [],
    missing_documents: [],
    provider: params.provider,
    model: params.model,
    requires_human_review: true,
    validated_law_references: [
      { citation: "CPC, art. 300", summary: "Tutela de urgência", source_url: "https://example.com/cpc300" },
      { citation: "Lei 8.213/91", summary: "Benefícios previdenciários", source_url: "https://example.com/lei8213" },
    ],
    validated_case_law_references: [
      { citation: "Tema 1102/STJ", summary: "Revisão da vida toda", source_url: "https://example.com/tema1102" },
    ],
    ...(params.extraMetadata || {}),
  };
}

function buildExecutionPayload(params: {
  draftFactoryTaskId: string;
  artifactId: string;
  caseBrainTaskId: string;
  nowIso: string;
  draftMarkdown: string;
  confidenceNote: string;
  model: string;
}) {
  return {
    draftFactoryTaskId: params.draftFactoryTaskId,
    runId: "",
    stepId: "",
    artifactId: params.artifactId,
    caseBrainTaskId: params.caseBrainTaskId,
    recommendedPieceInput: FIXTURE_PIECE_INPUT,
    recommendedPieceLabel: FIXTURE_PIECE_LABEL,
    result: {
      pieceType: "contestacao",
      pieceLabel: FIXTURE_PIECE_LABEL,
      pieceFamily: "peca_juridica",
      pieceFamilyLabel: "Peça Jurídica",
      practiceArea: "Previdenciário",
      outline: ["Síntese", "Fundamentos", "Pedidos"],
      draftMarkdown: params.draftMarkdown,
      usedDocuments: buildUsedDocumentsForResult(params.nowIso),
      missingDocuments: [],
      warnings: [],
      confidenceNote: params.confidenceNote,
      requiresHumanReview: true,
      model: params.model,
      provider: "playwright-fixture",
      expansionApplied: false,
      qualityMetrics: {
        charCount: 1480,
        wordCount: 228,
        paragraphCount: 10,
        sectionCount: 4,
      },
    },
  } satisfies DraftFactoryExecutionPayload;
}

function buildVersionRow(params: {
  id: string;
  tenantId: string;
  processTaskId: string;
  sourceArtifactId: string | null;
  sourceTaskId: string | null;
  sourceCaseBrainTaskId: string | null;
  parentVersionId: string | null;
  versionNumber: number;
  workflowStatus: "draft" | "approved" | "published";
  isCurrent: boolean;
  summary: string;
  draftMarkdown: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  publishedAt?: string | null;
}) {
  return {
    id: params.id,
    tenant_id: params.tenantId,
    process_task_id: params.processTaskId,
    source_artifact_id: params.sourceArtifactId,
    source_task_id: params.sourceTaskId,
    source_case_brain_task_id: params.sourceCaseBrainTaskId,
    parent_version_id: params.parentVersionId,
    version_number: params.versionNumber,
    workflow_status: params.workflowStatus,
    is_current: params.isCurrent,
    piece_type: "contestacao",
    piece_label: FIXTURE_PIECE_LABEL,
    practice_area: "Previdenciário",
    summary: params.summary,
    draft_markdown: params.draftMarkdown,
    metadata: params.metadata,
    approved_at: params.approvedAt || null,
    published_at: params.publishedAt || null,
    created_at: params.createdAt,
    updated_at: params.updatedAt,
  };
}

type ScenarioState = {
  memory: Record<string, unknown>;
  versions: Array<Record<string, unknown>>;
  currentDraftVersionId: string | null;
  publishedDraftVersionId: string | null;
  staleDraftVersionId: string | null;
  firstDraftArtifactId: string | null;
  draftFactoryExecution: DraftFactoryExecutionPayload | null;
};

function buildScenarioState(params: {
  scenario: PlaywrightDocumentFixtureScenario;
  tenantId: string;
  oneHourAgo: string;
  tenMinutesAgo: string;
  fiveMinutesAgo: string;
  nowIso: string;
}) {
  const currentDraftMarkdown = "# Contestação Previdenciária\n\n## Síntese\n\nVersão corrente pronta para aprovação formal.\n\n## Pedidos\n\nRequer o acolhimento integral da tese previdenciária.";
  const retryDraftMarkdown = "# Contestação Previdenciária\n\n## Síntese\n\nRetry concluído com grounding documental do tenant E2E.\n\n## Pedidos\n\nRequer a improcedência integral da tese adversa.";
  const staleDraftMarkdown = "# Contestação Previdenciária\n\n## Síntese\n\nVersão anterior gerada com contexto do Case Brain que já ficou desatualizado.\n\n## Pedidos\n\nManter apenas para referência histórica.";
  const regeneratedDraftMarkdown = "# Contestação Previdenciária\n\n## Síntese\n\nMinuta regenerada com o novo contexto do Case Brain e memória documental atualizada.\n\n## Pedidos\n\nAcolher integralmente a tese previdenciária revisada.";

  const formalCurrentVersion = buildVersionRow({
    id: FIXTURE_IDS.formalCurrentDraftVersionId,
    tenantId: params.tenantId,
    processTaskId: FIXTURE_IDS.processTaskId,
    sourceArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    sourceTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
    sourceCaseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
    parentVersionId: FIXTURE_IDS.publishedDraftVersionId,
    versionNumber: 2,
    workflowStatus: "draft",
    isCurrent: true,
    summary: "Versão corrente aguardando aprovação e publicação formal.",
    draftMarkdown: currentDraftMarkdown,
    metadata: buildVersionMetadata({
      nowIso: params.nowIso,
      provider: "playwright-fixture",
      model: "seeded-history-v2",
      artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    }),
    createdAt: params.tenMinutesAgo,
    updatedAt: params.fiveMinutesAgo,
  });

  const publishedVersion = buildVersionRow({
    id: FIXTURE_IDS.publishedDraftVersionId,
    tenantId: params.tenantId,
    processTaskId: FIXTURE_IDS.processTaskId,
    sourceArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    sourceTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
    sourceCaseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
    parentVersionId: null,
    versionNumber: 1,
    workflowStatus: "published",
    isCurrent: false,
    summary: "Versão publicada anterior da minuta jurídica.",
    draftMarkdown: "# Contestação Previdenciária\n\n## Síntese\n\nVersão publicada anterior para referência histórica.",
    metadata: buildVersionMetadata({
      nowIso: params.nowIso,
      provider: "playwright-fixture",
      model: "seeded-history-v1",
      artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
      extraMetadata: {
        premium_publish: {
          format: "pdf",
          fileName: "contestacao-previdenciaria-e2e.pdf",
          driveFileId: "playwright-premium-file-1",
          webViewLink: "https://drive.google.com/file/d/playwright-premium-file-1/view",
          driveFolderLabel: "09-Pecas Finais",
          driveFolderUrl: "https://drive.google.com/drive/folders/e2e-historico-formal-mayus",
          publishedAt: params.oneHourAgo,
        },
        learning_loop_capture: {
          capturedAt: params.oneHourAgo,
          sourceKind: "source_artifact",
          sourceLabel: "a primeira minuta gerada",
          changed: true,
          changeRatio: 0.34,
          categories: ["substantive_expansion", "citations_enriched"],
          summary: "Delta capturado contra a primeira minuta gerada · +1200 caracteres · +3 paragrafos · +1 secoes · +2 citacoes · 34% de variacao estimada · sinais: substantive_expansion, citations_enriched",
        },
      },
    }),
    createdAt: params.oneHourAgo,
    updatedAt: params.oneHourAgo,
    approvedAt: params.oneHourAgo,
    publishedAt: params.oneHourAgo,
  });

  const retryCompletedVersion = buildVersionRow({
    id: FIXTURE_IDS.retryDraftVersionId,
    tenantId: params.tenantId,
    processTaskId: FIXTURE_IDS.processTaskId,
    sourceArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    sourceTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
    sourceCaseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
    parentVersionId: null,
    versionNumber: 1,
    workflowStatus: "draft",
    isCurrent: true,
    summary: "Primeira minuta gerada após retry manual da Draft Factory.",
    draftMarkdown: retryDraftMarkdown,
    metadata: buildVersionMetadata({
      nowIso: params.nowIso,
      provider: "playwright-fixture",
      model: "seeded-retry-v1",
      artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    }),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  });

  const staleVersion = buildVersionRow({
    id: FIXTURE_IDS.staleDraftVersionId,
    tenantId: params.tenantId,
    processTaskId: FIXTURE_IDS.processTaskId,
    sourceArtifactId: FIXTURE_IDS.staleFirstDraftArtifactId,
    sourceTaskId: FIXTURE_IDS.staleFirstDraftTaskId,
    sourceCaseBrainTaskId: FIXTURE_IDS.previousCaseBrainTaskId,
    parentVersionId: null,
    versionNumber: 1,
    workflowStatus: "draft",
    isCurrent: true,
    summary: "Primeira minuta anterior agora está stale em relação ao novo Case Brain.",
    draftMarkdown: staleDraftMarkdown,
    metadata: buildVersionMetadata({
      nowIso: params.tenMinutesAgo,
      provider: "playwright-fixture",
      model: "seeded-stale-v1",
      artifactId: FIXTURE_IDS.staleFirstDraftArtifactId,
    }),
    createdAt: params.tenMinutesAgo,
    updatedAt: params.fiveMinutesAgo,
  });

  const regeneratedVersion = buildVersionRow({
    id: FIXTURE_IDS.regeneratedDraftVersionId,
    tenantId: params.tenantId,
    processTaskId: FIXTURE_IDS.processTaskId,
    sourceArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    sourceTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
    sourceCaseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
    parentVersionId: FIXTURE_IDS.staleDraftVersionId,
    versionNumber: 2,
    workflowStatus: "draft",
    isCurrent: true,
    summary: "Primeira minuta regenerada com o novo contexto do Case Brain.",
    draftMarkdown: regeneratedDraftMarkdown,
    metadata: buildVersionMetadata({
      nowIso: params.nowIso,
      provider: "playwright-fixture",
      model: "seeded-regenerated-v2",
      artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
    }),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  });

  switch (params.scenario) {
    case "first_draft_failed":
      return {
        memory: {
          case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_status: "failed",
          first_draft_task_id: FIXTURE_IDS.currentFirstDraftTaskId,
          first_draft_artifact_id: null,
          first_draft_case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_summary: null,
          first_draft_error: "Falha simulada da Draft Factory para validar o retry manual.",
          first_draft_generated_at: null,
        },
        versions: [],
        currentDraftVersionId: null,
        publishedDraftVersionId: null,
        staleDraftVersionId: null,
        firstDraftArtifactId: null,
        draftFactoryExecution: null,
      } satisfies ScenarioState;
    case "first_draft_retry_completed":
      return {
        memory: {
          case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_status: "completed",
          first_draft_task_id: FIXTURE_IDS.currentFirstDraftTaskId,
          first_draft_artifact_id: FIXTURE_IDS.currentFirstDraftArtifactId,
          first_draft_case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_summary: "Primeira minuta regenerada via retry e pronta para revisão formal.",
          first_draft_error: null,
          first_draft_generated_at: params.nowIso,
        },
        versions: [retryCompletedVersion],
        currentDraftVersionId: FIXTURE_IDS.retryDraftVersionId,
        publishedDraftVersionId: null,
        staleDraftVersionId: null,
        firstDraftArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
        draftFactoryExecution: buildExecutionPayload({
          draftFactoryTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
          artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
          caseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
          nowIso: params.nowIso,
          draftMarkdown: retryDraftMarkdown,
          confidenceNote: "Retry concluído com grounding documental do tenant E2E.",
          model: "seeded-retry-v1",
        }),
      } satisfies ScenarioState;
    case "first_draft_stale":
      return {
        memory: {
          case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_status: "completed",
          first_draft_task_id: FIXTURE_IDS.staleFirstDraftTaskId,
          first_draft_artifact_id: FIXTURE_IDS.staleFirstDraftArtifactId,
          first_draft_case_brain_task_id: FIXTURE_IDS.previousCaseBrainTaskId,
          first_draft_summary: "A versão abaixo ainda é útil para referência, mas já está desatualizada e deve ser regenerada.",
          first_draft_error: null,
          first_draft_generated_at: params.tenMinutesAgo,
        },
        versions: [staleVersion],
        currentDraftVersionId: FIXTURE_IDS.staleDraftVersionId,
        publishedDraftVersionId: null,
        staleDraftVersionId: FIXTURE_IDS.staleDraftVersionId,
        firstDraftArtifactId: FIXTURE_IDS.staleFirstDraftArtifactId,
        draftFactoryExecution: null,
      } satisfies ScenarioState;
    case "first_draft_regenerated":
      return {
        memory: {
          case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_status: "completed",
          first_draft_task_id: FIXTURE_IDS.currentFirstDraftTaskId,
          first_draft_artifact_id: FIXTURE_IDS.currentFirstDraftArtifactId,
          first_draft_case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_summary: "Primeira minuta atualizada com o novo contexto do Case Brain.",
          first_draft_error: null,
          first_draft_generated_at: params.nowIso,
        },
        versions: [
          { ...staleVersion, is_current: false },
          regeneratedVersion,
        ],
        currentDraftVersionId: FIXTURE_IDS.regeneratedDraftVersionId,
        publishedDraftVersionId: null,
        staleDraftVersionId: FIXTURE_IDS.staleDraftVersionId,
        firstDraftArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
        draftFactoryExecution: buildExecutionPayload({
          draftFactoryTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
          artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
          caseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
          nowIso: params.nowIso,
          draftMarkdown: regeneratedDraftMarkdown,
          confidenceNote: "Minuta regenerada com o novo contexto do Case Brain e memória documental atualizada.",
          model: "seeded-regenerated-v2",
        }),
      } satisfies ScenarioState;
    case "formal_history":
    default:
      return {
        memory: {
          case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_status: "completed",
          first_draft_task_id: FIXTURE_IDS.currentFirstDraftTaskId,
          first_draft_artifact_id: FIXTURE_IDS.currentFirstDraftArtifactId,
          first_draft_case_brain_task_id: FIXTURE_IDS.currentCaseBrainTaskId,
          first_draft_summary: "Primeira minuta disponível para revisão formal e exportação em Word.",
          first_draft_error: null,
          first_draft_generated_at: params.nowIso,
        },
        versions: [publishedVersion, formalCurrentVersion],
        currentDraftVersionId: FIXTURE_IDS.formalCurrentDraftVersionId,
        publishedDraftVersionId: FIXTURE_IDS.publishedDraftVersionId,
        staleDraftVersionId: null,
        firstDraftArtifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
        draftFactoryExecution: buildExecutionPayload({
          draftFactoryTaskId: FIXTURE_IDS.currentFirstDraftTaskId,
          artifactId: FIXTURE_IDS.currentFirstDraftArtifactId,
          caseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
          nowIso: params.nowIso,
          draftMarkdown: regeneratedDraftMarkdown,
          confidenceNote: "Primeira minuta carregada a partir da fixture formal do tenant E2E.",
          model: "seeded-history-v2",
        }),
      } satisfies ScenarioState;
  }
}

export async function ensurePlaywrightDocumentFixture(options?: { scenario?: PlaywrightDocumentFixtureScenario }): Promise<FixtureInfo> {
  const scenario = options?.scenario || "formal_history";
  const env = loadEnvFile();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios para a fixture E2E.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenantId = await resolveFixtureTenantId(supabase, env);
  const { pipelineId, stageId } = await resolvePipelineAndStage(supabase, tenantId);

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();
  const scenarioState = buildScenarioState({ scenario, tenantId, oneHourAgo, tenMinutesAgo, fiveMinutesAgo, nowIso });
  const currentArtifactDraftMarkdown = scenario === "first_draft_retry_completed"
    ? "# Contestação Previdenciária\n\n## Síntese\n\nRetry concluído com grounding documental do tenant E2E.\n\n## Pedidos\n\nRequer a improcedência integral da tese adversa."
    : scenario === "formal_history"
      ? "# Contestação Previdenciária\n\n## Síntese\n\nVersão corrente pronta para aprovação formal.\n\n## Pedidos\n\nRequer o acolhimento integral da tese previdenciária."
      : "# Contestação Previdenciária\n\n## Síntese\n\nMinuta regenerada com o novo contexto do Case Brain e memória documental atualizada.\n\n## Pedidos\n\nAcolher integralmente a tese previdenciária revisada.";
  const currentArtifactModel = scenario === "first_draft_retry_completed"
    ? "seeded-retry-v1"
    : scenario === "formal_history"
      ? "seeded-history-v2"
      : scenario === "first_draft_regenerated"
        ? "seeded-regenerated-v2"
        : "seeded-first-draft-current";
  const currentArtifactSummary = scenario === "first_draft_retry_completed"
    ? "Retry concluído com grounding documental do tenant E2E."
    : scenario === "formal_history"
      ? "Primeira minuta carregada a partir da fixture formal do tenant E2E."
      : "Primeira minuta pronta e alinhada ao contexto atual do Case Brain.";

  const { error: taskError } = await supabase
    .from("process_tasks")
    .upsert({
      id: FIXTURE_IDS.processTaskId,
      tenant_id: tenantId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      title: FIXTURE_TITLE,
      description: "Fixture determinística do Playwright para histórico formal da minuta e Draft Factory.",
      position_index: 0,
      value: 0,
      tags: [],
      lead_scoring: 0,
      liminar_deferida: false,
      client_name: "Cliente Playwright E2E",
      process_number: "E2E-2026-0001",
      demanda: "Previdenciário",
      urgency: "ROTINA",
      drive_link: "https://drive.google.com/drive/folders/e2e-historico-formal-mayus",
      drive_folder_id: "e2e-historico-formal-mayus",
      drive_structure_ready: true,
      data_ultima_movimentacao: nowIso,
    }, { onConflict: "id" });

  if (taskError) throw taskError;

  const { error: documentError } = await supabase
    .from("process_documents")
    .upsert({
      id: FIXTURE_IDS.documentId,
      tenant_id: tenantId,
      process_task_id: FIXTURE_IDS.processTaskId,
      drive_file_id: "playwright-e2e-document-1",
      drive_folder_id: "e2e-historico-formal-mayus",
      folder_label: "03-Contestacao",
      name: "contestacao-previdenciaria-e2e.pdf",
      mime_type: "application/pdf",
      size_bytes: 8192,
      modified_at: nowIso,
      web_view_link: FIXTURE_DOCUMENT_LINK,
      document_type: "contestacao",
      classification_status: "classified",
      extraction_status: "extracted",
    }, { onConflict: "id" });

  if (documentError) throw documentError;

  const { error: contentError } = await supabase
    .from("process_document_contents")
    .upsert({
      tenant_id: tenantId,
      process_document_id: FIXTURE_IDS.documentId,
      raw_text: "Contestação previdenciária com tese revisional e documentos internos sincronizados.",
      normalized_text: "Contestação previdenciária com tese revisional e documentos internos sincronizados.",
      excerpt: "Contestação previdenciária com tese revisional.",
      page_count: 3,
      extraction_status: "extracted",
      extracted_at: nowIso,
      extraction_error: null,
    }, { onConflict: "process_document_id" });

  if (contentError) throw contentError;

  const { error: brainTasksError } = await supabase
    .from("brain_tasks")
    .upsert([
      {
        id: FIXTURE_IDS.previousCaseBrainTaskId,
        tenant_id: tenantId,
        created_by: null,
        channel: "system",
        module: "lex",
        status: "completed",
        title: "Case Brain E2E anterior",
        goal: "Preparar o contexto jurídico anterior da fixture de Documentos.",
        task_input: {},
        task_context: {
          process_task_id: FIXTURE_IDS.processTaskId,
          source: "revenue_to_case",
          case_id: FIXTURE_CASE_ID,
          legal_area: "Previdenciário",
        },
        policy_snapshot: {},
        result_summary: "Contexto anterior preparado para a fixture E2E.",
        error_message: null,
        started_at: oneHourAgo,
        completed_at: oneHourAgo,
        created_at: oneHourAgo,
        updated_at: oneHourAgo,
      },
      {
        id: FIXTURE_IDS.currentCaseBrainTaskId,
        tenant_id: tenantId,
        created_by: null,
        channel: "system",
        module: "lex",
        status: "completed",
        title: "Case Brain E2E atual",
        goal: "Preparar o contexto jurídico atual da fixture de Documentos.",
        task_input: {},
        task_context: {
          process_task_id: FIXTURE_IDS.processTaskId,
          source: "revenue_to_case",
          case_id: FIXTURE_CASE_ID,
          legal_area: "Previdenciário",
        },
        policy_snapshot: {},
        result_summary: "Contexto atual preparado para a fixture E2E.",
        error_message: null,
        started_at: fiveMinutesAgo,
        completed_at: fiveMinutesAgo,
        created_at: fiveMinutesAgo,
        updated_at: fiveMinutesAgo,
      },
      {
        id: FIXTURE_IDS.staleFirstDraftTaskId,
        tenant_id: tenantId,
        created_by: null,
        channel: "system",
        module: "lex",
        status: "completed",
        title: "Draft Factory E2E anterior",
        goal: "Gerar a primeira minuta antiga da fixture E2E.",
        task_input: {},
        task_context: {
          process_task_id: FIXTURE_IDS.processTaskId,
          source: "draft_factory",
          case_id: FIXTURE_CASE_ID,
          legal_area: "Previdenciário",
        },
        policy_snapshot: {},
        result_summary: "Minuta anterior gerada para a fixture E2E.",
        error_message: null,
        started_at: tenMinutesAgo,
        completed_at: tenMinutesAgo,
        created_at: tenMinutesAgo,
        updated_at: tenMinutesAgo,
      },
      {
        id: FIXTURE_IDS.currentFirstDraftTaskId,
        tenant_id: tenantId,
        created_by: null,
        channel: "system",
        module: "lex",
        status: scenario === "first_draft_failed" ? "failed" : "completed",
        title: "Draft Factory E2E atual",
        goal: "Gerar a primeira minuta atual da fixture E2E.",
        task_input: {},
        task_context: {
          process_task_id: FIXTURE_IDS.processTaskId,
          source: "draft_factory",
          case_id: FIXTURE_CASE_ID,
          legal_area: "Previdenciário",
        },
        policy_snapshot: {},
        result_summary: scenario === "first_draft_failed" ? null : "Minuta atual gerada para a fixture E2E.",
        error_message: scenario === "first_draft_failed" ? "Falha simulada da Draft Factory para validar o retry manual." : null,
        started_at: nowIso,
        completed_at: scenario === "first_draft_failed" ? nowIso : nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ], { onConflict: "id" });

  if (brainTasksError) throw brainTasksError;

  const { error: brainMemoriesError } = await supabase
    .from("brain_memories")
    .upsert([
      {
        id: FIXTURE_IDS.previousDraftPlanMemoryId,
        tenant_id: tenantId,
        task_id: FIXTURE_IDS.previousCaseBrainTaskId,
        run_id: null,
        scope: "case",
        memory_type: "draft_plan",
        memory_key: "playwright-document-fixture:previous:draft_plan",
        value: buildDraftPlanSummary(),
        source: "playwright-fixture",
        confidence: 1,
        promoted: true,
        created_by: null,
        created_at: oneHourAgo,
        updated_at: oneHourAgo,
      },
      {
        id: FIXTURE_IDS.previousResearchMemoryId,
        tenant_id: tenantId,
        task_id: FIXTURE_IDS.previousCaseBrainTaskId,
        run_id: null,
        scope: "case",
        memory_type: "legal_research_pack",
        memory_key: "playwright-document-fixture:previous:research_pack",
        value: {
          queries: ["contestação previdenciária revisão da vida toda"],
          current_phase: "Contestação",
          summary_master: "Contexto jurídico anterior da fixture E2E.",
          key_facts: ["Documento base sincronizado", "Hipótese revisional previdenciária"],
        },
        source: "playwright-fixture",
        confidence: 1,
        promoted: true,
        created_by: null,
        created_at: oneHourAgo,
        updated_at: oneHourAgo,
      },
      {
        id: FIXTURE_IDS.previousValidatedSourcePackMemoryId,
        tenant_id: tenantId,
        task_id: FIXTURE_IDS.previousCaseBrainTaskId,
        run_id: null,
        scope: "case",
        memory_type: "validated_source_pack",
        memory_key: "playwright-document-fixture:previous:validated_source_pack",
        value: buildValidatedSourcePack(tenMinutesAgo),
        source: "playwright-fixture",
        confidence: 1,
        promoted: true,
        created_by: null,
        created_at: oneHourAgo,
        updated_at: oneHourAgo,
      },
      {
        id: FIXTURE_IDS.currentDraftPlanMemoryId,
        tenant_id: tenantId,
        task_id: FIXTURE_IDS.currentCaseBrainTaskId,
        run_id: null,
        scope: "case",
        memory_type: "draft_plan",
        memory_key: "playwright-document-fixture:current:draft_plan",
        value: buildDraftPlanSummary(),
        source: "playwright-fixture",
        confidence: 1,
        promoted: true,
        created_by: null,
        created_at: fiveMinutesAgo,
        updated_at: fiveMinutesAgo,
      },
      {
        id: FIXTURE_IDS.currentResearchMemoryId,
        tenant_id: tenantId,
        task_id: FIXTURE_IDS.currentCaseBrainTaskId,
        run_id: null,
        scope: "case",
        memory_type: "legal_research_pack",
        memory_key: "playwright-document-fixture:current:research_pack",
        value: {
          queries: ["contestação previdenciária revisão da vida toda atualização"],
          current_phase: "Contestação",
          summary_master: "Contexto jurídico atual da fixture E2E.",
          key_facts: ["Documento base sincronizado", "Base legal validada", "Jurisprudência validada"],
        },
        source: "playwright-fixture",
        confidence: 1,
        promoted: true,
        created_by: null,
        created_at: fiveMinutesAgo,
        updated_at: fiveMinutesAgo,
      },
      {
        id: FIXTURE_IDS.currentValidatedSourcePackMemoryId,
        tenant_id: tenantId,
        task_id: FIXTURE_IDS.currentCaseBrainTaskId,
        run_id: null,
        scope: "case",
        memory_type: "validated_source_pack",
        memory_key: "playwright-document-fixture:current:validated_source_pack",
        value: buildValidatedSourcePack(nowIso),
        source: "playwright-fixture",
        confidence: 1,
        promoted: true,
        created_by: null,
        created_at: fiveMinutesAgo,
        updated_at: fiveMinutesAgo,
      },
    ], { onConflict: "id" });

  if (brainMemoriesError) throw brainMemoriesError;

  const { error: brainArtifactsError } = await supabase
    .from("brain_artifacts")
    .upsert([
      {
        id: FIXTURE_IDS.staleFirstDraftArtifactId,
        task_id: FIXTURE_IDS.staleFirstDraftTaskId,
        run_id: null,
        step_id: null,
        tenant_id: tenantId,
        artifact_type: "case_first_draft",
        title: "Primeira minuta stale - fixture E2E",
        storage_url: null,
        mime_type: "text/markdown",
        source_module: "lex",
        metadata: buildDraftArtifactMetadata({
          caseBrainTaskId: FIXTURE_IDS.previousCaseBrainTaskId,
          nowIso: tenMinutesAgo,
          draftMarkdown: "# Contestação Previdenciária\n\n## Síntese\n\nVersão anterior gerada com contexto do Case Brain que já ficou desatualizado.\n\n## Pedidos\n\nManter apenas para referência histórica.",
          summary: "Primeira minuta antiga preservada apenas para consulta histórica.",
          provider: "playwright-fixture",
          model: "seeded-first-draft-stale",
          memoryRefs: {
            draft_plan: FIXTURE_IDS.previousDraftPlanMemoryId,
            legal_research_pack: FIXTURE_IDS.previousResearchMemoryId,
            validated_source_pack: FIXTURE_IDS.previousValidatedSourcePackMemoryId,
          },
        }),
        created_at: tenMinutesAgo,
      },
      {
        id: FIXTURE_IDS.currentFirstDraftArtifactId,
        task_id: FIXTURE_IDS.currentFirstDraftTaskId,
        run_id: null,
        step_id: null,
        tenant_id: tenantId,
        artifact_type: "case_first_draft",
        title: "Primeira minuta atual - fixture E2E",
        storage_url: null,
        mime_type: "text/markdown",
        source_module: "lex",
        metadata: buildDraftArtifactMetadata({
          caseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
          nowIso,
          draftMarkdown: currentArtifactDraftMarkdown,
          summary: currentArtifactSummary,
          provider: "playwright-fixture",
          model: currentArtifactModel,
          memoryRefs: {
            draft_plan: FIXTURE_IDS.currentDraftPlanMemoryId,
            legal_research_pack: FIXTURE_IDS.currentResearchMemoryId,
            validated_source_pack: FIXTURE_IDS.currentValidatedSourcePackMemoryId,
          },
        }),
        created_at: nowIso,
      },
    ], { onConflict: "id" });

  if (brainArtifactsError) throw brainArtifactsError;

  const { error: memoryError } = await supabase
    .from("process_document_memory")
    .upsert({
      tenant_id: tenantId,
      process_task_id: FIXTURE_IDS.processTaskId,
      drive_folder_id: "e2e-historico-formal-mayus",
      drive_folder_url: "https://drive.google.com/drive/folders/e2e-historico-formal-mayus",
      drive_folder_name: FIXTURE_TITLE,
      folder_structure: {},
      document_count: 1,
      sync_status: "completed",
      last_synced_at: nowIso,
      summary_master: "Caso previdenciário com minuta pronta para revisão formal do escritório.",
      key_facts: [],
      key_documents: [{ id: FIXTURE_IDS.documentId, name: "contestacao-previdenciaria-e2e.pdf" }],
      missing_documents: [],
      current_phase: "Contestação",
      draft_plan_summary: buildDraftPlanSummary(),
      ...scenarioState.memory,
    }, { onConflict: "process_task_id" });

  if (memoryError) throw memoryError;

  const { error: deleteVersionsError } = await supabase
    .from("process_draft_versions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("process_task_id", FIXTURE_IDS.processTaskId);

  if (deleteVersionsError) throw deleteVersionsError;

  if (scenarioState.versions.length > 0) {
    const { error: versionsError } = await supabase
      .from("process_draft_versions")
      .insert(scenarioState.versions);

    if (versionsError) throw versionsError;
  }

  return {
    scenario,
    tenantId,
    processTaskId: FIXTURE_IDS.processTaskId,
    processTitle: FIXTURE_TITLE,
    currentDraftVersionId: scenarioState.currentDraftVersionId,
    publishedDraftVersionId: scenarioState.publishedDraftVersionId,
    staleDraftVersionId: scenarioState.staleDraftVersionId,
    currentCaseBrainTaskId: FIXTURE_IDS.currentCaseBrainTaskId,
    previousCaseBrainTaskId: FIXTURE_IDS.previousCaseBrainTaskId,
    firstDraftArtifactId: scenarioState.firstDraftArtifactId,
    draftFactoryExecution: scenarioState.draftFactoryExecution,
  } satisfies FixtureInfo;
}

export const PLAYWRIGHT_DOCUMENT_FIXTURE_IDS = FIXTURE_IDS;
export const PLAYWRIGHT_DOCUMENT_FIXTURE_SCENARIOS = {
  formalHistory: "formal_history",
  firstDraftFailed: "first_draft_failed",
  firstDraftRetryCompleted: "first_draft_retry_completed",
  firstDraftStale: "first_draft_stale",
  firstDraftRegenerated: "first_draft_regenerated",
} as const;
export const PLAYWRIGHT_DOCUMENT_FIXTURE_TITLE = FIXTURE_TITLE;
