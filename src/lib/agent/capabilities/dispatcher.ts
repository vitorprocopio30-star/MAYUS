import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import { createAgentAuditLog } from "@/lib/agent/audit";
import {
  buildBillingIdempotencyKey,
  normalizeBillingEntities,
} from "@/lib/agent/capabilities/billing-normalization";
import { ZapSignService } from "@/lib/services/zapsign";
import { EscavadorService } from "@/lib/services/escavador";
import { executarCobranca } from "@/lib/agent/skills/asaas-cobrar";
import { executarCalculo } from "@/lib/agent/skills/calculadora";
import { generateProposalAndProjectToCrm } from "@/lib/agent/capabilities/proposals";
import { formatarContextoParaIA, getContextoProcesso } from "@/lib/skills/consulta-processo-whatsapp";
import {
  buildSupportCaseStatusContract,
  buildSupportCaseStatusReply,
  buildLegalCaseContextReply,
  getLegalCaseContextSnapshot,
  type LegalCaseContextSnapshot,
} from "@/lib/lex/case-context";
import { buildProcessMissionContext } from "@/lib/lex/process-mission-context";
import {
  executeDraftFactoryForProcessTask,
  type DraftFactoryExecutionResult,
} from "@/lib/lex/draft-factory";
import {
  listProcessDraftVersions,
  updateProcessDraftVersionWorkflow,
  type ProcessDraftVersionRecord,
} from "@/lib/lex/draft-versions";
import { normalizeLegalPieceRequest } from "@/lib/juridico/piece-catalog";
import {
  buildTenantGoogleDriveServiceRequest,
  getTenantGoogleDriveContext,
} from "@/lib/services/google-drive-tenant";
import { syncAgendaTaskBySource } from "@/lib/agenda/userTasks";
import { getTenantIntegrationResolved, listTenantIntegrationsResolved } from "@/lib/integrations/server";
import {
  syncProcessDocuments,
  type ProcessDocumentSyncWarning,
  type ProcessTaskDocumentContext,
} from "@/lib/services/process-documents";
import { publishLegalPiecePremium } from "@/lib/juridico/publish-piece-premium";
import {
  analyzeLeadIntake,
  buildCrmTaskPayload,
  buildLeadIntakeEventPayload,
  buildReferralIntakeArtifactMetadata,
  type LeadIntakeInput,
} from "@/lib/growth/lead-intake";
import {
  buildLeadQualificationArtifactMetadata,
  buildLeadQualificationPlan,
  type LeadQualificationInput,
} from "@/lib/growth/lead-qualification";
import {
  buildLeadFollowupArtifactMetadata,
  buildLeadFollowupPlan,
  type LeadFollowupInput,
} from "@/lib/growth/lead-followup";
import {
  buildLeadScheduleAgendaPayload,
  buildLeadScheduleArtifactMetadata,
  buildLeadSchedulePlan,
  type LeadScheduleInput,
} from "@/lib/growth/lead-scheduling";
import {
  buildRevenueFlowArtifactMetadata,
  buildRevenueFlowPlan,
  type RevenueFlowInput,
} from "@/lib/growth/revenue-flow";
import {
  buildExternalActionPreview,
  buildExternalActionPreviewMetadata,
  type ExternalActionPreviewInput,
} from "@/lib/growth/external-action-preview";
import {
  buildClientAcceptanceArtifactMetadata,
  buildClientAcceptanceRecord,
  buildClientAcceptanceSystemEventPayload,
  type ClientAcceptanceInput,
} from "@/lib/growth/client-acceptance";
import {
  buildColdLeadReactivationArtifactMetadata,
  buildColdLeadReactivationPlan,
  type ColdLeadCandidateInput,
  type ColdLeadReactivationInput,
} from "@/lib/growth/cold-lead-reactivation";
import {
  buildSalesConsultationArtifactMetadata,
  buildSalesConsultationPlan,
  type SalesConsultationInput,
} from "@/lib/growth/sales-consultation";
import {
  buildSalesProfileSetupArtifactMetadata,
  buildSalesProfileSetupPlan,
  type SalesProfileSetupInput,
  type SalesProfileSetupProfile,
} from "@/lib/growth/sales-profile-setup";
import {
  buildCommercialPlaybookArtifactMetadata,
  buildCommercialPlaybookReply,
  buildCommercialPlaybookSetup,
  type CommercialPlaybookSetupInput,
} from "@/lib/growth/commercial-playbook-template";
import {
  buildMarketingOpsAssistantMetadata,
  buildMarketingOpsAssistantPlan,
  type MarketingOpsAssistantInput,
} from "@/lib/growth/marketing-ops-assistant";
import {
  buildMarketingCopywriterArtifactMetadata,
  buildMarketingCopywriterDraft,
} from "@/lib/marketing/marketing-copywriter";
import type { EditorialCalendarItem } from "@/lib/marketing/editorial-calendar";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;
const COMMERCIAL_PIPELINE_ID = "7b4d39bb-785c-402a-826d-0088867d934c";

export interface CapabilityBrainContext {
  taskId?: string | null;
  runId?: string | null;
  stepId?: string | null;
  sourceModule?: string | null;
}

export interface DispatchCapabilityInput {
  handlerType: string | null;
  capabilityName: string;
  tenantId: string;
  userId?: string | null;
  entities: Record<string, string>;
  history?: Array<{ role: string; content: string }>;
  auditLogId?: string | null;
  brainContext?: CapabilityBrainContext;
}

export interface DispatchCapabilityResult {
  status: "executed" | "blocked" | "failed" | "unsupported" | "awaiting_approval";
  reply: string;
  data?: unknown;
  outputPayload?: Record<string, unknown>;
}

type BillingCrmTaskContext = {
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
};

type BrainArtifactContext = {
  id: string;
  artifact_type: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ClientCommercialContext = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  asaas_customer_id: string | null;
};

type CommercialContext = {
  crmTask: BillingCrmTaskContext | null;
  proposalArtifact: BrainArtifactContext | null;
  contractArtifact: BrainArtifactContext | null;
  billingArtifact: BrainArtifactContext | null;
  client: ClientCommercialContext | null;
  clientName: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  customerId: string | null;
  amount: number | null;
};

type TenantLegalTemplateReviewRecord = {
  piece_type: string;
  template_name?: string | null;
  template_mode?: string | null;
  structure_markdown?: string | null;
  guidance_notes?: string | null;
};

type MarketingOpsStateRecord = {
  ai_features: Record<string, any> | null;
};

type MarketingOpsCrmTaskRecord = {
  id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  sector: string | null;
  created_at: string | null;
  data_ultima_movimentacao: string | null;
};

type LegalDocumentMemoryRefreshResultStatus = "completed" | "failed";

function parseNumber(value: string | undefined) {
  const normalized = Number(String(value || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : NaN;
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = parseNumber(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
  return null;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  return getStringValue(metadata?.[key]);
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  return toNullableNumber(metadata?.[key]);
}

function getMetadataStringArray(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => getStringValue(item))
    .filter((item): item is string => Boolean(item));
}

function getMetadataRecord(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseMarkdownQualityMetrics(markdown: string) {
  const safeMarkdown = String(markdown || "").trim();
  if (!safeMarkdown) {
    return {
      charCount: 0,
      paragraphCount: 0,
      sectionCount: 0,
    };
  }

  const lines = safeMarkdown.split(/\r?\n/);
  const sectionCount = lines.filter((line) => {
    const trimmed = line.trim();
    return /^#{1,6}\s/.test(trimmed) || /^[IVXLCDM]+\s*[-.:]/i.test(trimmed);
  }).length;
  const paragraphCount = safeMarkdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;

  return {
    charCount: safeMarkdown.length,
    paragraphCount,
    sectionCount,
  };
}

function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR");
}

async function loadProcessTaskDocumentContext(tenantId: string, processTaskId: string) {
  const { data, error } = await serviceSupabase
    .from("process_tasks")
    .select("id, tenant_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id")
    .eq("tenant_id", tenantId)
    .eq("id", processTaskId)
    .maybeSingle<ProcessTaskDocumentContext>();

  if (error) throw error;
  return data || null;
}

function buildLegalDocumentMemoryRefreshSummary(params: {
  processLabel: string;
  documentCount: number;
  warningCount: number;
  missingDocuments: string[];
}) {
  const missingDocumentsLabel = params.missingDocuments.length > 0
    ? `Ainda existem ${params.missingDocuments.length} pendencia(s) documentais essenciais.`
    : "Nao ha pendencias documentais criticas registradas.";
  const warningsLabel = params.warningCount > 0
    ? `${params.warningCount} warning(s) surgiram durante a sincronizacao.`
    : "A sincronizacao terminou sem warnings operacionais.";

  return `Memoria documental atualizada para ${params.processLabel} com ${params.documentCount} documento(s) sincronizados. ${missingDocumentsLabel} ${warningsLabel}`;
}

function buildLegalDocumentMemoryRefreshNextStep(snapshot: LegalCaseContextSnapshot) {
  if (snapshot.caseBrain.recommendedPieceInput && (snapshot.firstDraft.status === "idle" || snapshot.firstDraft.status === "failed")) {
    return "Agora posso gerar a primeira minuta juridica com base no acervo atualizado.";
  }

  if (snapshot.firstDraft.status === "completed") {
    return "Agora posso revisar a minuta atual com base no acervo sincronizado.";
  }

  return "Agora posso montar o contexto juridico atualizado com base nos documentos sincronizados.";
}

function buildDocumentSyncWarningsLabel(warnings: ProcessDocumentSyncWarning[]) {
  if (warnings.length === 0) {
    return "nenhum warning operacional registrado";
  }

  return warnings
    .slice(0, 4)
    .map((warning) => `${warning.fileName}: ${warning.message}`)
    .join("; ");
}

function buildLegalDocumentMemoryRefreshReply(params: {
  snapshot: LegalCaseContextSnapshot;
  documentCount: number;
  warnings: ProcessDocumentSyncWarning[];
}) {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const nextStep = buildLegalDocumentMemoryRefreshNextStep(params.snapshot);
  const summary = buildLegalDocumentMemoryRefreshSummary({
    processLabel,
    documentCount: params.documentCount,
    warningCount: params.warnings.length,
    missingDocuments: params.snapshot.documentMemory.missingDocuments,
  });

  return {
    summary,
    reply: [
      "## Memoria documental atualizada",
      `- Processo: ${processLabel}`,
      `- Documentos sincronizados: ${params.documentCount}`,
      `- Status da sync: ${params.snapshot.documentMemory.syncStatus || "nao informado"}`,
      params.snapshot.documentMemory.lastSyncedAt
        ? `- Ultima sincronizacao: ${formatDateTimeLabel(params.snapshot.documentMemory.lastSyncedAt)}`
        : "- Ultima sincronizacao: ainda nao registrada",
      params.snapshot.documentMemory.summaryMaster
        ? `- Resumo documental: ${params.snapshot.documentMemory.summaryMaster}`
        : "- Resumo documental: ainda nao consolidado",
      params.snapshot.documentMemory.missingDocuments.length > 0
        ? `- Pendencias documentais: ${params.snapshot.documentMemory.missingDocuments.join("; ")}`
        : "- Pendencias documentais: nenhuma pendencia critica registrada",
      `- Warnings da sync: ${buildDocumentSyncWarningsLabel(params.warnings)}`,
      `- Proximo passo sugerido: ${nextStep}`,
    ].filter(Boolean).join("\n"),
  };
}

async function registerLegalDocumentMemoryRefreshArtifact(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    reply: string;
    summary: string;
    documentCount: number;
    warnings: ProcessDocumentSyncWarning[];
    resultStatus: LegalDocumentMemoryRefreshResultStatus;
    errorMessage?: string | null;
  }
) {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;

  await registerArtifact(input, {
    artifactType: "legal_document_memory_refresh",
    title: `Memoria documental - ${params.snapshot.processTask.clientName || params.snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `legal-document-memory-refresh:${input.auditLogId}`
      : `legal-document-memory-refresh:${params.snapshot.processTask.id}:${params.snapshot.documentMemory.lastSyncedAt || params.resultStatus}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.resultStatus,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: params.snapshot.processTask.clientName,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      document_count: params.documentCount,
      sync_status: params.snapshot.documentMemory.syncStatus,
      last_synced_at: params.snapshot.documentMemory.lastSyncedAt,
      missing_documents: params.snapshot.documentMemory.missingDocuments,
      warning_count: params.warnings.length,
      warnings: params.warnings.map((warning) => ({
        stage: warning.stage,
        file_name: warning.fileName,
        message: warning.message,
      })),
      next_step: buildLegalDocumentMemoryRefreshNextStep(params.snapshot),
      error_message: params.errorMessage || null,
    },
  });
}

function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Protocolo invalido");
    if (PRIVATE_IP.test(parsed.hostname)) throw new Error("URL aponta para rede interna");
  } catch {
    throw new Error("URL da integracao de WhatsApp invalida ou nao permitida.");
  }
}

function resolveArtifactContext(input: DispatchCapabilityInput) {
  const taskId = input.brainContext?.taskId || null;
  if (!taskId) return null;

  return {
    tenantId: input.tenantId,
    taskId,
    runId: input.brainContext?.runId || null,
    stepId: input.brainContext?.stepId || null,
    sourceModule: input.brainContext?.sourceModule || "mayus",
  };
}

async function registerArtifact(
  input: DispatchCapabilityInput,
  params: {
    artifactType: string;
    title?: string | null;
    storageUrl?: string | null;
    mimeType?: string | null;
    metadata?: Record<string, unknown>;
    dedupeKey?: string | null;
  }
) {
  const artifactContext = resolveArtifactContext(input);
  if (!artifactContext) return;

  try {
    await createBrainArtifact({
      tenantId: artifactContext.tenantId,
      taskId: artifactContext.taskId,
      runId: artifactContext.runId,
      stepId: artifactContext.stepId,
      artifactType: params.artifactType,
      title: params.title || null,
      storageUrl: params.storageUrl || null,
      mimeType: params.mimeType || null,
      sourceModule: artifactContext.sourceModule,
      metadata: params.metadata,
      dedupeKey: params.dedupeKey || null,
    });
  } catch (artifactError) {
    console.error("[capability-dispatcher] artifact registrar", artifactError);
  }
}

async function registerLearningEvent(
  input: DispatchCapabilityInput,
  eventType: string,
  payload: Record<string, unknown>
) {
  const artifactContext = resolveArtifactContext(input);
  if (!artifactContext) return;

  try {
    await serviceSupabase.from("learning_events").insert({
      tenant_id: artifactContext.tenantId,
      task_id: artifactContext.taskId,
      run_id: artifactContext.runId,
      step_id: artifactContext.stepId,
      event_type: eventType,
      source_module: artifactContext.sourceModule,
      payload,
      created_by: input.userId || null,
    });
  } catch (eventError) {
    console.error("[capability-dispatcher] learning event", eventError);
  }
}

function extractBillingNameFromHistory(history: Array<{ role: string; content: string }> = []) {
  const cobrancaTrigger = /cobrar|cobranca|boleto|pix|fatura|emitir|gerar\s+pagamento/i;
  const nomePattern = /(?:cobrar|para|cliente|nome)[:\s]+([A-ZÀÁÂÃÉÊÍÓÔÕÚÜ][a-zàáâãéêíóôõúü]+(?:\s+[A-ZÀÁÂÃÉÊÍÓÔÕÚÜ][a-zàáâãéêíóôõúü]+)+)/i;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role !== "user") continue;
    if (!cobrancaTrigger.test(item.content)) continue;

    const match = item.content.match(nomePattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

async function resolveBillingCrmContext(input: DispatchCapabilityInput) {
  let crmTaskId = input.entities.crm_task_id || input.entities.task_id || "";

  if (!crmTaskId && input.brainContext?.taskId) {
    const { data: proposalArtifact } = await serviceSupabase
      .from("brain_artifacts")
      .select("metadata")
      .eq("tenant_id", input.tenantId)
      .eq("task_id", input.brainContext.taskId)
      .eq("artifact_type", "crm_proposal")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ metadata: Record<string, unknown> | null }>();

    crmTaskId = String(proposalArtifact?.metadata?.crm_task_id || "");
  }

  if (!crmTaskId) {
    return { crmTask: null as BillingCrmTaskContext | null };
  }

  const { data: crmTask } = await serviceSupabase
    .from("crm_tasks")
    .select("id, pipeline_id, stage_id, title, description, assigned_to, tags, phone, sector, value")
    .eq("tenant_id", input.tenantId)
    .eq("id", crmTaskId)
    .maybeSingle<BillingCrmTaskContext>();

  return { crmTask: crmTask || null };
}

async function resolveRecentArtifactByMetadata(params: {
  tenantId: string;
  artifactType: string;
  metadataKey: string;
  metadataValue: string | null;
}) {
  if (!params.metadataValue) return null;

  const { data } = await serviceSupabase
    .from("brain_artifacts")
    .select("id, artifact_type, title, metadata, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("artifact_type", params.artifactType)
    .eq(`metadata->>${params.metadataKey}`, params.metadataValue)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<BrainArtifactContext>();

  return data || null;
}

async function resolveClientContext(params: {
  tenantId: string;
  clientId?: string | null;
  customerId?: string | null;
  clientName?: string | null;
}) {
  if (params.clientId) {
    const { data } = await serviceSupabase
      .from("clients")
      .select("id, name, email, phone, document, asaas_customer_id")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.clientId)
      .maybeSingle<ClientCommercialContext>();
    if (data) return data;
  }

  if (params.customerId) {
    const { data } = await serviceSupabase
      .from("clients")
      .select("id, name, email, phone, document, asaas_customer_id")
      .eq("tenant_id", params.tenantId)
      .eq("asaas_customer_id", params.customerId)
      .maybeSingle<ClientCommercialContext>();
    if (data) return data;
  }

  if (params.clientName) {
    const { data } = await serviceSupabase
      .from("clients")
      .select("id, name, email, phone, document, asaas_customer_id")
      .eq("tenant_id", params.tenantId)
      .eq("name", params.clientName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ClientCommercialContext>();
    if (data) return data;
  }

  return null;
}

async function resolveCommercialContext(input: DispatchCapabilityInput): Promise<CommercialContext> {
  const { crmTask } = await resolveBillingCrmContext(input);
  const directClientName =
    getStringValue(input.entities.client_name) ||
    getStringValue(input.entities.nome_cliente) ||
    getStringValue(input.entities.lead_name) ||
    getStringValue(input.entities.contact_name);
  const directEmail = getStringValue(input.entities.signer_email) || getStringValue(input.entities.email);
  const directPhone = getStringValue(input.entities.phone_number) || getStringValue(input.entities.phone);
  const directDocument = getStringValue(input.entities.cpf_cnpj) || getStringValue(input.entities.document);
  const directCustomerId = getStringValue(input.entities.customer_id);

  let proposalArtifact: BrainArtifactContext | null = null;
  let contractArtifact: BrainArtifactContext | null = null;
  let billingArtifact: BrainArtifactContext | null = null;

  if (input.brainContext?.taskId) {
    const { data: artifacts } = await serviceSupabase
      .from("brain_artifacts")
      .select("id, artifact_type, title, metadata, created_at")
      .eq("tenant_id", input.tenantId)
      .eq("task_id", input.brainContext.taskId)
      .in("artifact_type", ["crm_proposal", "zapsign_contract", "asaas_billing"])
      .order("created_at", { ascending: false });

    proposalArtifact = (artifacts || []).find((artifact) => artifact.artifact_type === "crm_proposal") || null;
    contractArtifact = (artifacts || []).find((artifact) => artifact.artifact_type === "zapsign_contract") || null;
    billingArtifact = (artifacts || []).find((artifact) => artifact.artifact_type === "asaas_billing") || null;
  }

  const crmTaskId =
    crmTask?.id ||
    getMetadataString(proposalArtifact?.metadata, "crm_task_id") ||
    getMetadataString(contractArtifact?.metadata, "crm_task_id") ||
    getMetadataString(billingArtifact?.metadata, "crm_task_id") ||
    null;

  if (!proposalArtifact && crmTaskId) {
    proposalArtifact = await resolveRecentArtifactByMetadata({
      tenantId: input.tenantId,
      artifactType: "crm_proposal",
      metadataKey: "crm_task_id",
      metadataValue: crmTaskId,
    });
  }

  if (!contractArtifact && crmTaskId) {
    contractArtifact = await resolveRecentArtifactByMetadata({
      tenantId: input.tenantId,
      artifactType: "zapsign_contract",
      metadataKey: "crm_task_id",
      metadataValue: crmTaskId,
    });
  }

  const proposalClientName = getMetadataString(proposalArtifact?.metadata, "client_name");
  const proposalEmail = getMetadataString(proposalArtifact?.metadata, "email");
  const proposalPhone = getMetadataString(proposalArtifact?.metadata, "phone");
  const proposalDocument = getMetadataString(proposalArtifact?.metadata, "cpf_cnpj");
  const proposalAmount = getMetadataNumber(proposalArtifact?.metadata, "total_value");
  const contractSignerName = getMetadataString(contractArtifact?.metadata, "signer_name");
  const contractSignerEmail = getMetadataString(contractArtifact?.metadata, "signer_email");
  const artifactCustomerId = getMetadataString(billingArtifact?.metadata, "asaas_customer_id");
  const artifactClientId =
    getMetadataString(proposalArtifact?.metadata, "client_id") ||
    getMetadataString(contractArtifact?.metadata, "client_id") ||
    getMetadataString(billingArtifact?.metadata, "client_id");

  const clientName = directClientName || contractSignerName || proposalClientName || crmTask?.title || null;
  const client = await resolveClientContext({
    tenantId: input.tenantId,
    clientId: artifactClientId || null,
    customerId: directCustomerId || artifactCustomerId || null,
    clientName,
  });

  return {
    crmTask,
    proposalArtifact,
    contractArtifact,
    billingArtifact,
    client,
    clientName: clientName || client?.name || null,
    email: directEmail || contractSignerEmail || proposalEmail || client?.email || null,
    phone: directPhone || proposalPhone || crmTask?.phone || client?.phone || null,
    document: directDocument || proposalDocument || client?.document || null,
    customerId: directCustomerId || artifactCustomerId || client?.asaas_customer_id || null,
    amount: toNullableNumber(input.entities.valor) ?? proposalAmount ?? crmTask?.value ?? null,
  };
}

async function runZapSignContract(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const commercialContext = await resolveCommercialContext(input);
  const integration = await getTenantIntegrationResolved(input.tenantId, "zapsign");

  if (!integration?.api_key) {
    return {
      status: "failed",
      reply: "Integracao ZapSign nao configurada (api_key ausente).",
      outputPayload: {
        status: "approved_not_executed",
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
      },
    };
  }

  const signerName =
    getStringValue(input.entities.signer_name) ||
    commercialContext.clientName ||
    "Cliente";
  const signerEmail =
    getStringValue(input.entities.signer_email) ||
    commercialContext.email ||
    "";

  if (!signerEmail) {
    return {
      status: "failed",
      reply: "Nao encontrei um email valido para gerar o contrato. Informe o email do cliente ou mantenha o CRM atualizado.",
    };
  }

  const result = await ZapSignService.createDocument({
    apiToken: integration.api_key,
    docName: `Contrato - ${signerName}`,
    signers: [{ name: signerName, email: signerEmail }],
    lang: "pt-br",
  });

  const signUrl = result.signers?.[0]?.sign_url ?? null;

  await registerArtifact(input, {
    artifactType: "zapsign_contract",
    title: `Contrato - ${signerName}`,
    storageUrl: signUrl,
    mimeType: "text/uri-list",
    dedupeKey: input.auditLogId ? `zapsign:${input.auditLogId}` : `zapsign:${input.capabilityName}:${signerEmail}:${signerName}`,
    metadata: {
      audit_log_id: input.auditLogId || null,
      signer_name: signerName,
      signer_email: signerEmail || null,
      client_name: commercialContext.clientName,
      client_id: commercialContext.client?.id || null,
      crm_task_id: commercialContext.crmTask?.id || null,
      document_token: result.token ?? null,
      sign_url: signUrl,
    },
  });

  await registerLearningEvent(input, "contract_generated", {
    signer_name: signerName,
    signer_email: signerEmail,
    crm_task_id: commercialContext.crmTask?.id || null,
    sign_url: signUrl,
  });

  return {
    status: "executed",
    reply: signUrl
      ? `Contrato gerado com sucesso para ${signerName}. Assinatura: ${signUrl}`
      : `Contrato gerado com sucesso para ${signerName}.`,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      document_token: result.token ?? null,
      sign_url: signUrl,
    },
    data: {
      signUrl,
      token: result.token ?? null,
    },
  };
}

async function runEscavadorConsulta(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const integration = await getTenantIntegrationResolved(input.tenantId, "escavador");

  if (!integration?.api_key) {
    return { status: "failed", reply: "A integracao com o Escavador nao esta configurada no seu painel." };
  }

  const resultado = await EscavadorService.consultarProcesso(integration.api_key, input.entities.numero_cnj || "");
  if (!resultado) {
    return { status: "executed", reply: "Processo nao encontrado no Escavador." };
  }

  const resumo = `**Processo ${input.entities.numero_cnj}**\nTribunal: ${resultado.tribunal || "N/A"}\nStatus: Encontrado com sucesso.`;

  await registerArtifact(input, {
    artifactType: "escavador_process_lookup",
    title: `Consulta ${input.entities.numero_cnj || "processo"}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId ? `escavador-consulta:${input.auditLogId}` : null,
    metadata: {
      process_number: input.entities.numero_cnj || null,
      result: resultado,
    },
  });

  return {
    status: "executed",
    reply: resumo,
    data: resultado,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      process_number: input.entities.numero_cnj || null,
    },
  };
}

async function runEscavadorCpf(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const integration = await getTenantIntegrationResolved(input.tenantId, "escavador");

  if (!integration?.api_key) {
    return { status: "failed", reply: "A integracao com o Escavador nao esta configurada no seu painel." };
  }

  const processos = await EscavadorService.buscarPorCPFCNPJ(integration.api_key, input.entities.cpf_cnpj || "");

  await registerArtifact(input, {
    artifactType: "escavador_document_lookup",
    title: `Busca documento ${input.entities.cpf_cnpj || "sem-doc"}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId ? `escavador-cpf:${input.auditLogId}` : null,
    metadata: {
      document: input.entities.cpf_cnpj || null,
      result: processos,
    },
  });

  return {
    status: "executed",
    reply: "Foram encontrados registros para o documento informado. Resposta completa internamente.",
    data: processos,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      document: input.entities.cpf_cnpj || null,
    },
  };
}

async function runProposalGenerate(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const projection = await generateProposalAndProjectToCrm({
    tenantId: input.tenantId,
    userId: input.userId || null,
    entities: input.entities,
  });

  await registerArtifact(input, {
    artifactType: "crm_proposal",
    title: `Proposta - ${input.entities.client_name || input.entities.nome_cliente || input.entities.lead_name || "cliente"}`,
    mimeType: "text/markdown",
    dedupeKey: input.auditLogId ? `proposal:${input.auditLogId}` : `proposal:${projection.crmTaskId || input.entities.client_name || input.capabilityName}`,
    metadata: {
      reply: projection.proposalText,
      crm_task_id: projection.crmTaskId,
      pipeline_id: projection.pipelineId,
      stage_id: projection.stageId,
      projected_to_crm: projection.projectedToCrm,
      created_task: projection.created,
      client_name: getStringValue(input.entities.client_name) || getStringValue(input.entities.nome_cliente) || getStringValue(input.entities.lead_name),
      email: getStringValue(input.entities.email),
      phone: getStringValue(input.entities.phone_number) || getStringValue(input.entities.phone),
      cpf_cnpj: getStringValue(input.entities.cpf_cnpj),
      legal_area: getStringValue(input.entities.legal_area) || getStringValue(input.entities.area) || getStringValue(input.entities.segmento),
      total_value: getStringValue(input.entities.total_value) || getStringValue(input.entities.valor_total) || getStringValue(input.entities.valor),
      entry_value: getStringValue(input.entities.entry_value) || getStringValue(input.entities.valor_entrada),
      installments: getStringValue(input.entities.installments) || getStringValue(input.entities.parcelas),
    },
  });

  await registerLearningEvent(input, "proposal_generated", {
    crm_task_id: projection.crmTaskId,
    pipeline_id: projection.pipelineId,
    stage_id: projection.stageId,
    projected_to_crm: projection.projectedToCrm,
    created_task: projection.created,
  });

  const crmFeedback = projection.projectedToCrm
    ? projection.created
      ? "A proposta foi criada e projetada em uma nova oportunidade no CRM."
      : "A proposta foi projetada na oportunidade existente do CRM."
    : "A proposta foi gerada, mas nao houve pipeline comercial disponivel para projeção no CRM.";

  return {
    status: "executed",
    reply: `${crmFeedback}\n\n${projection.proposalText}`,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: projection.crmTaskId,
      pipeline_id: projection.pipelineId,
      stage_id: projection.stageId,
      projected_to_crm: projection.projectedToCrm,
      created_task: projection.created,
    },
    data: projection,
  };
}

async function findExistingBillingByIdempotencyKey(tenantId: string, billingIdempotencyKey: string) {
  const { data } = await serviceSupabase
    .from("brain_artifacts")
    .select("id, title, storage_url, metadata, created_at")
    .eq("tenant_id", tenantId)
    .eq("artifact_type", "asaas_billing")
    .eq("metadata->>billing_idempotency_key", billingIdempotencyKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      title: string | null;
      storage_url: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>();

  return data || null;
}

async function runAsaasBilling(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const normalizedBilling = normalizeBillingEntities(input.entities);
  if (normalizedBilling.errors.length > 0) {
    return {
      status: "failed",
      reply: normalizedBilling.errors[0],
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        billing_validation_error: normalizedBilling.errors[0],
      },
    };
  }

  const normalizedInput = {
    ...input,
    entities: normalizedBilling.entities,
  };
  const commercialContext = await resolveCommercialContext(normalizedInput);
  const valor = Number.isFinite(parseNumber(normalizedInput.entities.valor))
    ? parseNumber(normalizedInput.entities.valor)
    : commercialContext.amount ?? NaN;
  const nomeResolvido =
    getStringValue(normalizedInput.entities.nome_cliente) ||
    extractBillingNameFromHistory(input.history) ||
    commercialContext.clientName ||
    undefined;

  if (!Number.isFinite(valor) || valor <= 0) {
    return {
      status: "failed",
      reply: "Valor da cobranca precisa ser positivo.",
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        billing_validation_error: "invalid_amount",
      },
    };
  }

  const clientKey =
    commercialContext.client?.id ||
    commercialContext.customerId ||
    getStringValue(normalizedInput.entities.customer_id) ||
    nomeResolvido ||
    null;

  if (!clientKey) {
    return {
      status: "failed",
      reply: "Nao foi possivel identificar o cliente da cobranca.",
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        billing_validation_error: "missing_client",
      },
    };
  }

  const originKey =
    commercialContext.crmTask?.id ||
    normalizedInput.brainContext?.taskId ||
    normalizedInput.auditLogId ||
    normalizedInput.capabilityName;
  const billingIdempotencyKey = buildBillingIdempotencyKey({
    tenantId: input.tenantId,
    clientKey,
    amount: valor,
    dueDate: normalizedInput.entities.vencimento,
    originKey,
  });
  const existingBilling = await findExistingBillingByIdempotencyKey(input.tenantId, billingIdempotencyKey);
  if (existingBilling) {
    return {
      status: "blocked",
      reply: "Cobranca duplicada bloqueada: ja existe uma cobranca com mesmo cliente, valor, vencimento e origem.",
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        billing_duplicate: true,
        billing_artifact_id: existingBilling.id,
        billing_idempotency_key: billingIdempotencyKey,
      },
      data: existingBilling,
    };
  }

  const result = await executarCobranca({
    tenantId: input.tenantId,
    customer_id: normalizedInput.entities.customer_id || commercialContext.customerId || undefined,
    nome_cliente: nomeResolvido,
    cpf_cnpj: normalizedInput.entities.cpf_cnpj || commercialContext.document || undefined,
    email: normalizedInput.entities.email || commercialContext.email || undefined,
    valor,
    vencimento: normalizedInput.entities.vencimento,
    descricao: normalizedInput.entities.descricao,
    billing_type: normalizedInput.entities.billing_type as "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED" | undefined,
    parcelas: normalizedInput.entities.parcelas ? Number(normalizedInput.entities.parcelas) : undefined,
    recorrente: normalizedInput.entities.recorrente === "true",
    ciclo: normalizedInput.entities.ciclo as "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY" | undefined,
  });

  if (!result.success) {
    return { status: "failed", reply: result.error ?? "Erro ao gerar cobranca." };
  }

  const paymentUrl = result.invoiceUrl ?? result.bankSlipUrl ?? result.paymentLink ?? null;

  await registerArtifact(normalizedInput, {
    artifactType: "asaas_billing",
    title: `Cobranca ${nomeResolvido || normalizedInput.entities.customer_id || result.cobrancaId || "cliente"}`,
    storageUrl: paymentUrl,
    mimeType: "text/uri-list",
    dedupeKey: billingIdempotencyKey,
    metadata: {
      billing_idempotency_key: billingIdempotencyKey,
      billing_status: "created",
      status_inicial: "created",
      customer_id: result.asaasCustomerId || normalizedInput.entities.customer_id || null,
      nome_cliente: result.clientName || nomeResolvido || null,
      cobranca_id: result.cobrancaId || null,
      invoice_url: result.invoiceUrl || null,
      bank_slip_url: result.bankSlipUrl || null,
      payment_link: result.paymentLink || null,
      client_id: result.clientId || null,
      asaas_customer_id: result.asaasCustomerId || normalizedInput.entities.customer_id || null,
      crm_task_id: commercialContext.crmTask?.id || null,
      crm_pipeline_id: commercialContext.crmTask?.pipeline_id || null,
      crm_stage_id: commercialContext.crmTask?.stage_id || null,
      assigned_to: commercialContext.crmTask?.assigned_to || null,
      phone: commercialContext.phone,
      sector: commercialContext.crmTask?.sector || normalizedInput.entities.sector || null,
      legal_area: normalizedInput.entities.legal_area || normalizedInput.entities.area || normalizedInput.entities.segmento || null,
      proposal_source: commercialContext.crmTask ? "crm_task" : input.brainContext?.taskId ? "brain_task" : null,
      valor: Number.isFinite(valor) ? valor : null,
      parcelas: normalizedInput.entities.parcelas ? Number(normalizedInput.entities.parcelas) : 1,
      billing_type: normalizedInput.entities.billing_type || null,
      vencimento: normalizedInput.entities.vencimento || null,
      defaulted_fields: normalizedBilling.defaultedFields,
    },
  });

  await registerLearningEvent(normalizedInput, "billing_created", {
    cobranca_id: result.cobrancaId || null,
    asaas_customer_id: result.asaasCustomerId || normalizedInput.entities.customer_id || null,
    client_id: result.clientId || null,
    crm_task_id: commercialContext.crmTask?.id || null,
    value: Number.isFinite(valor) ? valor : null,
    billing_idempotency_key: billingIdempotencyKey,
  });

  return {
    status: "executed",
    reply: paymentUrl
      ? `Cobranca gerada com sucesso! [Clique aqui para pagar](${paymentUrl})`
      : `Cobranca gerada com sucesso! ID: ${result.cobrancaId}`,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      cobranca_id: result.cobrancaId || null,
      invoice_url: result.invoiceUrl || null,
      bank_slip_url: result.bankSlipUrl || null,
      payment_link: result.paymentLink || null,
      client_id: result.clientId || null,
      asaas_customer_id: result.asaasCustomerId || normalizedInput.entities.customer_id || null,
      crm_task_id: commercialContext.crmTask?.id || null,
      billing_idempotency_key: billingIdempotencyKey,
      billing_status: "created",
    },
    data: result,
  };
}

async function runKanbanUpdate(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const { data: card } = await serviceSupabase
    .from("process_tasks")
    .select("id, stage_id")
    .eq("processo_1grau", input.entities.numero_cnj)
    .maybeSingle();

  if (!card) {
    return { status: "failed", reply: "Processo nao encontrado no Kanban." };
  }

  const updateData: Record<string, unknown> = {
    andamento_1grau: input.entities.andamento,
    updated_at: new Date().toISOString(),
  };

  if (input.entities.nova_etapa) {
    const { data: stage } = await serviceSupabase
      .from("process_stages")
      .select("id")
      .eq("pipeline_id", COMMERCIAL_PIPELINE_ID)
      .ilike("name", `%${input.entities.nova_etapa}%`)
      .maybeSingle();

    if (stage?.id) {
      updateData.stage_id = stage.id;
    }
  }

  await serviceSupabase.from("process_tasks").update(updateData).eq("id", card.id);

  return {
    status: "executed",
    reply: `Processo ${input.entities.numero_cnj} atualizado no Kanban com sucesso.`,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      process_task_id: card.id,
      stage_id: String(updateData.stage_id || card.stage_id || ""),
    },
  };
}

async function runWhatsAppContext(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const contexto = await getContextoProcesso(input.tenantId, input.entities.q || "");
  const reply = Array.isArray(contexto) ? formatarContextoParaIA(contexto as Record<string, unknown>[]) : String(contexto || "");

  return {
    status: "executed",
    reply,
    data: contexto,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      result_count: Array.isArray(contexto) ? contexto.length : 0,
    },
  };
}

async function runWhatsAppSend(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const contactId = input.entities.contact_id;
  const phoneNumber = input.entities.phone_number;
  const text = input.entities.text || input.entities.message;
  const audioUrl = input.entities.audio_url;

  if (!contactId || !phoneNumber || (!text && !audioUrl)) {
    return { status: "failed", reply: "Parametros insuficientes para envio de WhatsApp." };
  }

  const integrations = await listTenantIntegrationsResolved(input.tenantId, ["meta_cloud", "evolution"]);
  const integrationError = null;

  if (integrationError || !integrations || integrations.length === 0) {
    return { status: "failed", reply: "Nenhuma integracao de WhatsApp encontrada." };
  }

  const provider = integrations.find((item) => item.provider === "evolution") || integrations.find((item) => item.provider === "meta_cloud");
  if (!provider) {
    return { status: "failed", reply: "Nenhuma integracao de WhatsApp encontrada." };
  }

  let apiResponse: unknown = null;

  if (provider.provider === "meta_cloud") {
    const [phoneId] = String(provider.instance_name || "").split("|");
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
    };

    if (audioUrl) {
      payload.type = "audio";
      payload.audio = { link: audioUrl };
    } else {
      payload.type = "text";
      payload.text = { body: text };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    apiResponse = await response.json();
    if (!response.ok) {
      throw new Error(`Erro Meta Web API: ${JSON.stringify(apiResponse)}`);
    }
  } else {
    const [baseUrlRaw, instanceName] = String(provider.instance_name || "").split("|");
    const baseUrl = baseUrlRaw.replace(/\/$/, "");
    validateUrl(baseUrl);
    const cleanPhone = phoneNumber.split("@")[0];

    let url = `${baseUrl}/message/sendText/${instanceName}`;
    const payload: Record<string, unknown> = { number: cleanPhone };

    if (audioUrl) {
      url = `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`;
      payload.audio = audioUrl;
    } else {
      payload.text = text;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: provider.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    apiResponse = await response.json();
    if (!response.ok) {
      throw new Error(`Erro Evolution API: ${JSON.stringify(apiResponse)}`);
    }
  }

  await serviceSupabase.from("whatsapp_messages").insert({
    tenant_id: input.tenantId,
    contact_id: contactId,
    direction: "outbound",
    content: audioUrl ? "[Audio Enviado]" : text,
    status: "sent",
  });

  await registerArtifact(input, {
    artifactType: "whatsapp_message",
    title: `WhatsApp para ${phoneNumber}`,
    dedupeKey: input.auditLogId ? `whatsapp:${input.auditLogId}` : `whatsapp:${contactId}:${phoneNumber}:${text || audioUrl}`,
    metadata: {
      contact_id: contactId,
      phone_number: phoneNumber,
      text: text || null,
      audio_url: audioUrl || null,
      provider: provider.provider,
      api_response: apiResponse,
    },
  });

  return {
    status: "executed",
    reply: audioUrl ? "Audio enviado com sucesso no WhatsApp." : "Mensagem enviada com sucesso no WhatsApp.",
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      contact_id: contactId,
      phone_number: phoneNumber,
      provider: provider.provider,
    },
    data: apiResponse,
  };
}

async function runEscavadorMonitor(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const integration = await getTenantIntegrationResolved(input.tenantId, "escavador");

  if (!integration?.api_key) {
    return { status: "failed", reply: "Integracao Escavador nao configurada. Acao aprovada mas nao executada." };
  }

  const monitor = await EscavadorService.criarMonitoramento(
    integration.api_key,
    input.entities.numero_cnj || "",
    input.entities.frequencia || "SEMANAL"
  );

  if (monitor?.id) {
    await serviceSupabase
      .from("monitored_processes")
      .update({ escavador_monitoramento_id: String(monitor.id) })
      .eq("numero_processo", input.entities.numero_cnj || "")
      .eq("tenant_id", input.tenantId);
  }

  await registerArtifact(input, {
    artifactType: "escavador_monitoring",
    title: `Monitoramento ${input.entities.numero_cnj || "processo"}`,
    dedupeKey: input.auditLogId ? `escavador-monitor:${input.auditLogId}` : `escavador-monitor:${input.entities.numero_cnj || ""}`,
    metadata: {
      audit_log_id: input.auditLogId || null,
      process_number: input.entities.numero_cnj || null,
      frequency: input.entities.frequencia || null,
      escavador_monitoramento_id: monitor?.id ?? null,
    },
  });

  return {
    status: "executed",
    reply: "Monitoramento criado com sucesso no Escavador.",
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      escavador_monitoramento_id: monitor?.id ?? null,
      process_number: input.entities.numero_cnj || null,
    },
    data: monitor,
  };
}

async function getOrCreateGrowthPipeline(tenantId: string) {
  const { data: existing, error: existingError } = await serviceSupabase
    .from("crm_pipelines")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return String(existing.id);

  const { data: pipeline, error: pipelineError } = await serviceSupabase
    .from("crm_pipelines")
    .insert({
      tenant_id: tenantId,
      name: "Comercial",
    })
    .select("id")
    .single();

  if (pipelineError) throw pipelineError;

  await serviceSupabase.from("crm_stages").insert([
    { pipeline_id: pipeline.id, name: "Novo Lead", color: "#3b82f6", order_index: 0 },
    { pipeline_id: pipeline.id, name: "Qualificacao", color: "#fbbf24", order_index: 1 },
    { pipeline_id: pipeline.id, name: "Fechado", color: "#10b981", order_index: 2, is_win: true },
    { pipeline_id: pipeline.id, name: "Perdido", color: "#ef4444", order_index: 3, is_loss: true },
  ]);

  return String(pipeline.id);
}

async function getGrowthDefaultStageId(pipelineId: string) {
  const { data, error } = await serviceSupabase
    .from("crm_stages")
    .select("id, name, order_index")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true });

  if (error) throw error;

  const novoLead = data?.find((stage) => String(stage.name || "").toLowerCase().includes("lead"));
  const first = novoLead || data?.[0];

  if (first?.id) return String(first.id);

  const { data: inserted, error: insertError } = await serviceSupabase
    .from("crm_stages")
    .insert({ pipeline_id: pipelineId, name: "Novo Lead", color: "#3b82f6", order_index: 0 })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return String(inserted.id);
}

function buildLeadIntakeInputFromEntities(entities: Record<string, string>): LeadIntakeInput {
  return {
    name: getStringValue(entities.name) || getStringValue(entities.lead_name) || getStringValue(entities.client_name),
    phone: getStringValue(entities.phone) || getStringValue(entities.phone_number) || getStringValue(entities.whatsapp),
    email: getStringValue(entities.email),
    origin: getStringValue(entities.origin) || getStringValue(entities.source),
    channel: getStringValue(entities.channel),
    campaign: getStringValue(entities.campaign) || getStringValue(entities.utm_campaign),
    contentId: getStringValue(entities.contentId) || getStringValue(entities.content_id) || getStringValue(entities.utm_content),
    contentTitle: getStringValue(entities.contentTitle) || getStringValue(entities.content_title),
    landingPage: getStringValue(entities.landingPage) || getStringValue(entities.landing_page),
    referrer: getStringValue(entities.referrer),
    utmSource: getStringValue(entities.utmSource) || getStringValue(entities.utm_source),
    utmMedium: getStringValue(entities.utmMedium) || getStringValue(entities.utm_medium),
    utmCampaign: getStringValue(entities.utmCampaign) || getStringValue(entities.utm_campaign),
    utmTerm: getStringValue(entities.utmTerm) || getStringValue(entities.utm_term),
    utmContent: getStringValue(entities.utmContent) || getStringValue(entities.utm_content),
    legalArea: getStringValue(entities.legalArea) || getStringValue(entities.legal_area),
    city: getStringValue(entities.city),
    state: getStringValue(entities.state) || getStringValue(entities.uf),
    urgency: getStringValue(entities.urgency),
    pain: getStringValue(entities.pain) || getStringValue(entities.problem) || getStringValue(entities.case_summary),
    notes: getStringValue(entities.notes),
    referredBy: getStringValue(entities.referredBy) || getStringValue(entities.referred_by),
    referralRelationship: getStringValue(entities.referralRelationship) || getStringValue(entities.referral_relationship),
  };
}

function buildLeadIntakeReply(params: {
  kind: string;
  score: number;
  leadName: string;
  nextStep: string;
  needsHumanHandoff: boolean;
  crmTaskId: string;
}) {
  return [
    "## Lead registrado",
    `- Nome: ${params.leadName}`,
    `- Classificacao: ${params.kind}`,
    `- Score inicial: ${params.score}/100`,
    `- Proximo passo: ${params.nextStep}`,
    `- Handoff humano: ${params.needsHumanHandoff ? "sim" : "nao"}`,
    `- CRM: ${params.crmTaskId}`,
  ].join("\n");
}

function buildLeadQualificationReply(params: {
  leadName: string;
  confidence: string;
  nextBestAction: string;
  minimumDocuments: string[];
  riskFlags: string[];
}) {
  return [
    "## Qualificacao do lead",
    `- Lead: ${params.leadName}`,
    `- Confianca: ${params.confidence}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
    `- Documentos minimos: ${params.minimumDocuments.join("; ")}`,
    params.riskFlags.length > 0 ? `- Alertas: ${params.riskFlags.join("; ")}` : "- Alertas: nenhum alerta critico identificado",
  ].join("\n");
}

function buildLeadFollowupReply(params: {
  leadName: string;
  priority: string;
  nextBestAction: string;
  cadenceStepCount: number;
  requiresHumanApproval: boolean;
}) {
  return [
    "## Follow-up do lead",
    `- Lead: ${params.leadName}`,
    `- Prioridade: ${params.priority}`,
    `- Cadencia: ${params.cadenceStepCount} passos supervisionados`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
    `- Aprovacao humana: ${params.requiresHumanApproval ? "obrigatoria" : "nao exigida"}`,
  ].join("\n");
}

function buildLeadScheduleReply(params: {
  leadName: string;
  scheduledFor: string;
  urgency: string;
  agendaTaskId: string | null;
  nextBestAction: string;
}) {
  return [
    "## Agendamento do lead",
    `- Lead: ${params.leadName}`,
    `- Data/hora: ${formatDateTimeLabel(params.scheduledFor)}`,
    `- Urgencia: ${params.urgency}`,
    `- Agenda interna: ${params.agendaTaskId || "tarefa registrada sem ID retornado"}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
  ].join("\n");
}

function buildRevenueFlowReply(params: {
  clientName: string;
  nextBestAction: string;
  stepCount: number;
  blockedReason: string | null;
}) {
  return [
    "## Plano revenue-to-case",
    `- Cliente: ${params.clientName}`,
    `- Etapas: ${params.stepCount}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
    params.blockedReason ? `- Bloqueio: ${params.blockedReason}` : "- Bloqueio: nenhum bloqueio estrutural identificado",
  ].join("\n");
}

function buildExternalActionPreviewReply(params: {
  actionType: string;
  clientName: string;
  blockerCount: number;
  nextBestAction: string;
}) {
  return [
    "## Preview de acao externa",
    `- Acao: ${params.actionType.replaceAll("_", " ")}`,
    `- Cliente: ${params.clientName}`,
    `- Bloqueios: ${params.blockerCount}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
  ].join("\n");
}

function buildClientAcceptanceReply(params: {
  clientName: string;
  acceptanceType: string;
  auditStatus: string;
  nextBestAction: string;
}) {
  return [
    "## Aceite do cliente registrado",
    `- Cliente: ${params.clientName}`,
    `- Tipo: ${params.acceptanceType}`,
    `- Status: ${params.auditStatus.replaceAll("_", " ")}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
  ].join("\n");
}

function buildColdLeadReactivationReply(params: {
  segment: string;
  candidateCount: number;
  messageCount: number;
  nextBestAction: string;
  requiresHumanApproval: boolean;
}) {
  return [
    "## Reativacao de leads frios",
    `- Segmento: ${params.segment}`,
    `- Lista operacional: ${params.candidateCount} candidato(s)`,
    `- Mensagens sugeridas: ${params.messageCount}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
    `- Aprovacao humana: ${params.requiresHumanApproval ? "obrigatoria" : "nao exigida"}`,
  ].join("\n");
}

function buildSalesConsultationReply(params: {
  leadName: string;
  phase: string;
  customerProfile: string;
  objectionCount: number;
  discoveryCompleteness: number;
  missingSignalCount: number;
  nextDiscoveryQuestion: string;
  nextBestAction: string;
}) {
  return [
    "## Consultoria comercial DEF",
    `- Lead: ${params.leadName}`,
    `- Fase: ${params.phase}`,
    `- Perfil: ${params.customerProfile}`,
    `- Descoberta: ${params.discoveryCompleteness}% completa`,
    `- Sinais faltantes: ${params.missingSignalCount}`,
    `- Proxima pergunta: ${params.nextDiscoveryQuestion}`,
    `- Movimentos de objecao: ${params.objectionCount}`,
    `- Proximo melhor movimento: ${params.nextBestAction}`,
  ].join("\n");
}

function buildSalesProfileSetupReply(params: {
  status: string;
  completeness: number;
  idealClient: string | null;
  coreSolution: string | null;
  puv: string | null;
  pillarCount: number;
  missingSignalCount: number;
  nextQuestion: string;
  persisted: boolean;
}) {
  return [
    "## Auto-configuracao comercial",
    `- Status: ${params.status.replaceAll("_", " ")}`,
    `- Perfil: ${params.completeness}% completo`,
    `- Cliente ideal: ${params.idealClient || "ainda investigando"}`,
    `- Solucao central: ${params.coreSolution || "ainda investigando"}`,
    `- PUV: ${params.puv || "rascunho pendente"}`,
    `- Pilares: ${params.pillarCount}`,
    `- Sinais faltantes: ${params.missingSignalCount}`,
    `- Gravado nas configuracoes: ${params.persisted ? "sim" : "ainda nao"}`,
    `- Proxima pergunta: ${params.nextQuestion}`,
  ].join("\n");
}

function buildSalesConsultationInputFromEntities(entities: Record<string, string>): SalesConsultationInput {
  return {
    crmTaskId: getStringValue(entities.crm_task_id),
    leadName: getStringValue(entities.lead_name) || getStringValue(entities.name) || getStringValue(entities.client_name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    pain: getStringValue(entities.pain) || getStringValue(entities.problem) || getStringValue(entities.case_summary),
    channel: getStringValue(entities.channel),
    stage: getStringValue(entities.stage) || getStringValue(entities.phase),
    objective: getStringValue(entities.objective) || getStringValue(entities.goal),
    objection: getStringValue(entities.objection),
    ticketValue: getStringValue(entities.ticket_value) || getStringValue(entities.amount) || getStringValue(entities.valor),
    conversationSummary: getStringValue(entities.conversation_summary) || getStringValue(entities.notes),
    officeIdealClient: getStringValue(entities.office_ideal_client),
    officeSolution: getStringValue(entities.office_solution),
    officeUniqueValueProposition: getStringValue(entities.office_unique_value_proposition),
    officePillars: getStringValue(entities.office_pillars)
      ? String(entities.office_pillars).split("|").map((item) => item.trim()).filter(Boolean)
      : null,
  };
}

function buildCommercialPlaybookInputFromEntities(entities: Record<string, string>): CommercialPlaybookSetupInput {
  const pillarsRaw = getStringValue(entities.value_pillars) || getStringValue(entities.office_pillars);

  return {
    firmName: getStringValue(entities.firm_name) || getStringValue(entities.office_name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea) || getStringValue(entities.segment),
    idealClient: getStringValue(entities.ideal_client) || getStringValue(entities.office_ideal_client),
    coreSolution: getStringValue(entities.core_solution) || getStringValue(entities.office_solution),
    uniqueValueProposition: getStringValue(entities.unique_value_proposition) || getStringValue(entities.office_unique_value_proposition),
    valuePillars: pillarsRaw
      ? pillarsRaw.split(/[|,;]/).map((item) => item.trim()).filter(Boolean)
      : undefined,
    positioningSummary: getStringValue(entities.positioning_summary) || getStringValue(entities.context),
    templateFlavor: getStringValue(entities.template_flavor) || getStringValue(entities.modelo),
    sourceDocument: getStringValue(entities.source_document) || getStringValue(entities.documento),
    notes: getStringValue(entities.notes) || getStringValue(entities.request),
  };
}

function buildSalesProfileSetupInputFromEntities(entities: Record<string, string>): SalesProfileSetupInput {
  return {
    idealClient: getStringValue(entities.office_ideal_client) || getStringValue(entities.ideal_client),
    coreSolution: getStringValue(entities.office_solution) || getStringValue(entities.core_solution) || getStringValue(entities.solution),
    uniqueValueProposition: getStringValue(entities.office_unique_value_proposition)
      || getStringValue(entities.unique_value_proposition)
      || getStringValue(entities.puv),
    valuePillars: getStringValue(entities.office_pillars) || getStringValue(entities.value_pillars) || getStringValue(entities.pillars)
      ? String(getStringValue(entities.office_pillars) || getStringValue(entities.value_pillars) || getStringValue(entities.pillars))
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
      : null,
    positioningSummary: getStringValue(entities.office_positioning_summary) || getStringValue(entities.positioning_summary),
    antiClientSignals: getStringValue(entities.anti_client_signals) || getStringValue(entities.anti_client)
      ? String(getStringValue(entities.anti_client_signals) || getStringValue(entities.anti_client))
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
      : null,
    confirmationText: getStringValue(entities.confirmation) || getStringValue(entities.confirm_save),
  };
}

function buildMarketingOpsAssistantInputFromEntities(entities: Record<string, string>): MarketingOpsAssistantInput {
  return {
    request: entities.request || null,
    legalArea: entities.legal_area || null,
    channel: entities.channel || null,
    objective: entities.objective || null,
  };
}

function buildMarketingCopywriterInputFromEntities(entities: Record<string, string>) {
  return {
    request: getStringValue(entities.request),
    contentId: getStringValue(entities.content_id) || getStringValue(entities.contentId),
    contentTitle: getStringValue(entities.content_title) || getStringValue(entities.contentTitle) || getStringValue(entities.title),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    channel: getStringValue(entities.channel),
    objective: getStringValue(entities.objective),
  };
}

function selectMarketingCopyItem(state: any, direct: ReturnType<typeof buildMarketingCopywriterInputFromEntities>): EditorialCalendarItem {
  const calendar = Array.isArray(state?.calendar) ? state.calendar as EditorialCalendarItem[] : [];
  const normalizedContentId = String(direct.contentId || "").trim().toLowerCase();
  const normalizedTitle = String(direct.contentTitle || "").trim().toLowerCase();
  const normalizedArea = String(direct.legalArea || "").trim().toLowerCase();
  const normalizedChannel = String(direct.channel || "").trim().toLowerCase();

  const matched = calendar.find((item) => normalizedContentId && String(item.id).toLowerCase() === normalizedContentId)
    || calendar.find((item) => normalizedTitle && String(item.title).toLowerCase().includes(normalizedTitle))
    || calendar.find((item) => item.status === "approved" && (!normalizedArea || String(item.legalArea).toLowerCase().includes(normalizedArea)) && (!normalizedChannel || item.channel === normalizedChannel))
    || calendar.find((item) => item.status === "approved")
    || calendar[0];

  if (matched) return matched;

  return {
    id: `copy-${Date.now()}`,
    title: direct.contentTitle || direct.request || "Pauta juridica para copy supervisionada",
    channel: (direct.channel === "instagram" || direct.channel === "blog" || direct.channel === "email" || direct.channel === "whatsapp" || direct.channel === "linkedin") ? direct.channel : "linkedin",
    legalArea: direct.legalArea || "Juridico geral",
    objective: direct.objective === "awareness" || direct.objective === "authority" || direct.objective === "lead_generation" || direct.objective === "nurture" || direct.objective === "retention" ? direct.objective : "authority",
    tone: "educational",
    audience: "leads qualificados",
    angle: direct.request || "orientacao juridica clara para decisao responsavel",
    guardrails: ["Nao copiar referencias", "Nao prometer resultado"],
    sourcePatternIds: [],
    date: new Date().toISOString().slice(0, 10),
    status: "approved",
    notes: "Pauta sintetica criada para rascunho de copy supervisionada.",
  };
}

async function loadMarketingOpsState(tenantId: string) {
  const { data, error } = await serviceSupabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .maybeSingle<MarketingOpsStateRecord>();

  if (error) throw error;
  const aiFeatures = data?.ai_features && typeof data.ai_features === "object" && !Array.isArray(data.ai_features)
    ? data.ai_features
    : {};
  const marketingOs = aiFeatures.marketing_os;
  return marketingOs && typeof marketingOs === "object" && !Array.isArray(marketingOs) ? marketingOs : {};
}

async function loadMarketingOpsCrmTasks(tenantId: string): Promise<MarketingOpsCrmTaskRecord[]> {
  const { data, error } = await serviceSupabase
    .from("crm_tasks")
    .select("id, title, description, tags, sector, created_at, data_ultima_movimentacao")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw error;
  return (data || []) as MarketingOpsCrmTaskRecord[];
}

function buildSalesConsultationConversationTurns(history: DispatchCapabilityInput["history"]) {
  return (history || [])
    .filter((item) => item?.role === "user" || item?.role === "model" || item?.role === "assistant")
    .map((item) => ({
      role: item.role === "model" ? "assistant" : item.role,
      content: String(item.content || "").slice(0, 1200),
    }))
    .filter((item) => item.content.trim())
    .slice(-12);
}

async function loadTenantSalesConsultationProfile(tenantId: string): Promise<SalesProfileSetupProfile | null> {
  try {
    const { data, error } = await serviceSupabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) return null;
    const profile = data?.ai_features?.sales_consultation_profile;
    if (!profile || typeof profile !== "object") return null;

    return {
      idealClient: getStringValue(profile.ideal_client),
      coreSolution: getStringValue(profile.core_solution),
      uniqueValueProposition: getStringValue(profile.unique_value_proposition),
      valuePillars: Array.isArray(profile.value_pillars)
        ? profile.value_pillars.map((item: unknown) => getStringValue(item)).filter((item): item is string => Boolean(item))
        : [],
      positioningSummary: getStringValue(profile.positioning_summary),
      antiClientSignals: Array.isArray(profile.anti_client_signals)
        ? profile.anti_client_signals.map((item: unknown) => getStringValue(item)).filter((item): item is string => Boolean(item))
        : [],
      status: getStringValue(profile.status),
    };
  } catch {
    return null;
  }
}

async function persistTenantSalesConsultationProfile(params: {
  tenantId: string;
  profile: SalesProfileSetupProfile & { status?: string | null };
}) {
  const { data } = await serviceSupabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", params.tenantId)
    .maybeSingle<{ ai_features: Record<string, unknown> | null }>();

  const aiFeatures = data?.ai_features && typeof data.ai_features === "object" && !Array.isArray(data.ai_features)
    ? data.ai_features
    : {};

  const salesProfile = {
    ideal_client: params.profile.idealClient || null,
    core_solution: params.profile.coreSolution || null,
    unique_value_proposition: params.profile.uniqueValueProposition || null,
    value_pillars: params.profile.valuePillars || [],
    positioning_summary: params.profile.positioningSummary || null,
    anti_client_signals: params.profile.antiClientSignals || [],
    status: params.profile.status || "draft",
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceSupabase
    .from("tenant_settings")
    .upsert({
      tenant_id: params.tenantId,
      ai_features: {
        ...aiFeatures,
        sales_consultation_profile: salesProfile,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });

  if (error) throw error;
  return salesProfile;
}

function buildColdLeadReactivationInputFromEntities(entities: Record<string, string>): ColdLeadReactivationInput {
  return {
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea) || getStringValue(entities.segment),
    segment: getStringValue(entities.segment),
    minDaysInactive: getStringValue(entities.min_days_inactive) || getStringValue(entities.days_inactive),
    maxLeads: getStringValue(entities.max_leads) || getStringValue(entities.limit),
    goal: getStringValue(entities.goal) || getStringValue(entities.objective),
  };
}

function buildClientAcceptanceInputFromEntities(entities: Record<string, string>): ClientAcceptanceInput {
  return {
    clientName: getStringValue(entities.client_name) || getStringValue(entities.lead_name) || getStringValue(entities.name),
    crmTaskId: getStringValue(entities.crm_task_id),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    acceptanceType: getStringValue(entities.acceptance_type) || getStringValue(entities.type),
    acceptanceChannel: getStringValue(entities.acceptance_channel) || getStringValue(entities.channel),
    evidenceSummary: getStringValue(entities.evidence_summary) || getStringValue(entities.notes),
    amount: getStringValue(entities.amount) || getStringValue(entities.valor) || getStringValue(entities.total_value),
    acceptedAt: getStringValue(entities.accepted_at) || getStringValue(entities.date),
  };
}

function buildExternalActionPreviewInputFromEntities(entities: Record<string, string>): ExternalActionPreviewInput {
  return {
    actionType: getStringValue(entities.action_type) || getStringValue(entities.action),
    clientName: getStringValue(entities.client_name) || getStringValue(entities.lead_name) || getStringValue(entities.name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    amount: getStringValue(entities.amount) || getStringValue(entities.valor) || getStringValue(entities.total_value),
    recipientName: getStringValue(entities.recipient_name) || getStringValue(entities.signer_name),
    recipientEmail: getStringValue(entities.recipient_email) || getStringValue(entities.signer_email) || getStringValue(entities.email),
    crmTaskId: getStringValue(entities.crm_task_id),
    notes: getStringValue(entities.notes),
  };
}

function buildRevenueFlowInputFromEntities(entities: Record<string, string>): RevenueFlowInput {
  return {
    crmTaskId: getStringValue(entities.crm_task_id),
    clientName: getStringValue(entities.client_name) || getStringValue(entities.lead_name) || getStringValue(entities.name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    amount: getStringValue(entities.amount) || getStringValue(entities.valor) || getStringValue(entities.total_value),
    proposalReady: entities.proposal_ready,
    contractReady: entities.contract_ready,
    billingReady: entities.billing_ready,
    paymentConfirmed: entities.payment_confirmed,
  };
}

function buildLeadQualificationInputFromEntities(entities: Record<string, string>): LeadQualificationInput {
  return {
    crmTaskId: getStringValue(entities.crm_task_id),
    leadName: getStringValue(entities.lead_name) || getStringValue(entities.name) || getStringValue(entities.client_name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    pain: getStringValue(entities.pain) || getStringValue(entities.problem) || getStringValue(entities.case_summary),
    score: toNullableNumber(entities.score),
  };
}

function buildLeadScheduleInputFromEntities(entities: Record<string, string>): LeadScheduleInput {
  return {
    crmTaskId: getStringValue(entities.crm_task_id),
    leadName: getStringValue(entities.lead_name) || getStringValue(entities.name) || getStringValue(entities.client_name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    pain: getStringValue(entities.pain) || getStringValue(entities.problem) || getStringValue(entities.case_summary),
    score: toNullableNumber(entities.score),
    scheduledFor: getStringValue(entities.scheduled_for) || getStringValue(entities.date) || getStringValue(entities.datetime),
    meetingType: getStringValue(entities.meeting_type) || getStringValue(entities.type),
    ownerId: getStringValue(entities.owner_id) || getStringValue(entities.assigned_to),
    ownerName: getStringValue(entities.owner_name) || getStringValue(entities.assigned_name),
    notes: getStringValue(entities.notes),
  };
}

function buildLeadFollowupInputFromEntities(entities: Record<string, string>): LeadFollowupInput {
  return {
    crmTaskId: getStringValue(entities.crm_task_id),
    leadName: getStringValue(entities.lead_name) || getStringValue(entities.name) || getStringValue(entities.client_name),
    legalArea: getStringValue(entities.legal_area) || getStringValue(entities.legalArea),
    pain: getStringValue(entities.pain) || getStringValue(entities.problem) || getStringValue(entities.case_summary),
    score: toNullableNumber(entities.score),
    goal: getStringValue(entities.goal) || getStringValue(entities.objective),
  };
}

async function loadGrowthLeadCrmContext(tenantId: string, crmTaskId: string | null) {
  if (!crmTaskId) return null;

  const { data, error } = await serviceSupabase
    .from("crm_tasks")
    .select("id, title, description, sector, source, lead_scoring, tags, assigned_to")
    .eq("tenant_id", tenantId)
    .eq("id", crmTaskId)
    .maybeSingle<{
      id: string;
      title: string | null;
      description: string | null;
      sector: string | null;
      source: string | null;
      lead_scoring: number | null;
      tags: string[] | null;
      assigned_to: string | null;
    }>();

  if (error) throw error;
  return data || null;
}

async function loadColdLeadCandidates(params: {
  tenantId: string;
  legalArea: string | null | undefined;
  maxLeads: number;
}): Promise<ColdLeadCandidateInput[]> {
  try {
    const { data, error } = await serviceSupabase
      .from("crm_tasks")
      .select("id, title, description, sector, source, lead_scoring, tags")
      .eq("tenant_id", params.tenantId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(50, params.maxLeads * 2)));

    if (error || !Array.isArray(data)) return [];

    const normalizedArea = String(params.legalArea || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    return data
      .filter((row: any) => {
        if (!normalizedArea) return true;
        const haystack = [
          row.sector,
          row.title,
          row.description,
          ...(Array.isArray(row.tags) ? row.tags : []),
        ].join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        return haystack.includes(normalizedArea);
      })
      .slice(0, params.maxLeads)
      .map((row: any) => ({
        id: getStringValue(row.id),
        name: getStringValue(row.title),
        legalArea: getStringValue(row.sector),
        source: getStringValue(row.source),
        score: toNullableNumber(row.lead_scoring),
        tags: Array.isArray(row.tags) ? row.tags : [],
      }));
  } catch {
    return [];
  }
}

async function runGrowthSalesConsultation(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildSalesConsultationInputFromEntities(input.entities);
  const crmTask = await loadGrowthLeadCrmContext(input.tenantId, direct.crmTaskId || null);
  const tenantSalesProfile = await loadTenantSalesConsultationProfile(input.tenantId);
  const plan = buildSalesConsultationPlan({
    crmTaskId: crmTask?.id || direct.crmTaskId || null,
    leadName: direct.leadName || crmTask?.title || null,
    legalArea: direct.legalArea || crmTask?.sector || null,
    pain: direct.pain || crmTask?.description || null,
    source: crmTask?.source || null,
    score: direct.score ?? crmTask?.lead_scoring ?? null,
    tags: crmTask?.tags || null,
    channel: direct.channel || null,
    stage: direct.stage || null,
    objective: direct.objective || null,
    objection: direct.objection || null,
    ticketValue: direct.ticketValue || null,
    conversationSummary: direct.conversationSummary || null,
    conversationTurns: buildSalesConsultationConversationTurns(input.history),
    officeIdealClient: direct.officeIdealClient || tenantSalesProfile?.idealClient || null,
    officeSolution: direct.officeSolution || tenantSalesProfile?.coreSolution || null,
    officeUniqueValueProposition: direct.officeUniqueValueProposition || tenantSalesProfile?.uniqueValueProposition || null,
    officePillars: direct.officePillars || tenantSalesProfile?.valuePillars || null,
    officePositioningSummary: tenantSalesProfile?.positioningSummary || null,
  });
  const crmTaskId = crmTask?.id || direct.crmTaskId || null;
  const metadata = buildSalesConsultationArtifactMetadata({
    crmTaskId,
    plan,
  });

  await registerArtifact(input, {
    artifactType: "sales_consultation_plan",
    title: `Consultoria comercial - ${plan.leadName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `sales-consultation:${input.auditLogId}`
      : `sales-consultation:${crmTaskId || plan.leadName}:${plan.phase}`,
    metadata,
  });

  await registerLearningEvent(input, "sales_consultation_plan_created", {
    summary: plan.summary,
    crm_task_id: crmTaskId,
    lead_name: plan.leadName,
    legal_area: plan.legalArea,
    consultation_phase: plan.phase,
    customer_profile: plan.customerProfile,
    objection_move_count: plan.objectionMoves.length,
    next_best_action: plan.nextBestAction,
    requires_human_review: plan.requiresHumanReview,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  });

  return {
    status: "executed",
    reply: buildSalesConsultationReply({
      leadName: plan.leadName,
      phase: plan.phase,
      customerProfile: plan.customerProfile,
      objectionCount: plan.objectionMoves.length,
      discoveryCompleteness: plan.discoveryCompleteness,
      missingSignalCount: plan.missingSignals.length,
      nextDiscoveryQuestion: plan.nextDiscoveryQuestion,
      nextBestAction: plan.nextBestAction,
    }),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: crmTaskId,
      lead_name: plan.leadName,
      sales_consultation_phase: plan.phase,
      sales_consultation_profile: plan.customerProfile,
      objection_move_count: plan.objectionMoves.length,
      discovery_completeness: plan.discoveryCompleteness,
      missing_signal_count: plan.missingSignals.length,
      next_discovery_question: plan.nextDiscoveryQuestion,
      firm_positioning_completeness: plan.firmProfile.positioningCompleteness,
      firm_profile_missing_signal_count: plan.firmProfile.missingSignals.length,
      firm_profile_drafted: plan.firmProfile.isDrafted,
      external_side_effects_blocked: plan.externalSideEffectsBlocked,
      requires_human_review: plan.requiresHumanReview,
    },
    data: {
      plan,
      crmTask,
    },
  };
}

async function runGrowthCommercialPlaybookSetup(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildCommercialPlaybookInputFromEntities(input.entities);
  const tenantSalesProfile = await loadTenantSalesConsultationProfile(input.tenantId);
  const playbook = buildCommercialPlaybookSetup({
    firmName: direct.firmName,
    legalArea: direct.legalArea,
    idealClient: direct.idealClient || tenantSalesProfile?.idealClient || null,
    coreSolution: direct.coreSolution || tenantSalesProfile?.coreSolution || null,
    uniqueValueProposition: direct.uniqueValueProposition || tenantSalesProfile?.uniqueValueProposition || null,
    valuePillars: direct.valuePillars || tenantSalesProfile?.valuePillars || null,
    positioningSummary: direct.positioningSummary || tenantSalesProfile?.positioningSummary || null,
    templateFlavor: direct.templateFlavor,
    sourceDocument: direct.sourceDocument,
    notes: direct.notes,
  });
  const metadata = buildCommercialPlaybookArtifactMetadata(playbook);

  await registerArtifact(input, {
    artifactType: "commercial_playbook_setup",
    title: `Playbook comercial - ${playbook.officeName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `commercial-playbook:${input.auditLogId}`
      : `commercial-playbook:${playbook.officeName}:${playbook.legalArea}`,
    metadata,
  });

  await registerLearningEvent(input, "commercial_playbook_setup_created", {
    method_name: playbook.methodName,
    office_name: playbook.officeName,
    legal_area: playbook.legalArea,
    first_response_sla_minutes: playbook.firstResponseSlaMinutes,
    step_count: playbook.steps.length,
    objection_count: playbook.objections.length,
    external_side_effects_blocked: true,
  });

  return {
    status: "executed",
    reply: buildCommercialPlaybookReply(playbook),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      artifact_type: "commercial_playbook_setup",
      method_name: playbook.methodName,
      office_name: playbook.officeName,
      legal_area: playbook.legalArea,
      first_response_sla_minutes: playbook.firstResponseSlaMinutes,
      daily_report_sections: playbook.dailyReportSections.map((section) => section.id),
      call_analysis_checklist_count: playbook.callAnalysisChecklist.length,
      external_side_effects_blocked: true,
      requires_human_review_for_legal_commitments: true,
    },
    data: {
      playbook,
    },
  };
}

async function runGrowthSalesProfileSetup(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildSalesProfileSetupInputFromEntities(input.entities);
  const existingProfile = await loadTenantSalesConsultationProfile(input.tenantId);
  const plan = buildSalesProfileSetupPlan({
    ...direct,
    existingProfile,
    conversationSummary: getStringValue(input.entities.conversation_summary) || getStringValue(input.entities.notes),
    conversationTurns: buildSalesConsultationConversationTurns(input.history),
  });

  let persisted = false;
  let persistError: string | null = null;
  if (plan.shouldPersist) {
    try {
      await persistTenantSalesConsultationProfile({
        tenantId: input.tenantId,
        profile: plan.profile,
      });
      persisted = true;
    } catch (error: any) {
      persistError = error?.message || "Nao foi possivel gravar o perfil comercial agora.";
    }
  }

  const metadata = {
    ...buildSalesProfileSetupArtifactMetadata(plan),
    persisted,
    persist_error: persistError,
  };

  await registerArtifact(input, {
    artifactType: "sales_profile_setup",
    title: "Auto-configuracao comercial MAYUS",
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `sales-profile-setup:${input.auditLogId}`
      : `sales-profile-setup:${input.tenantId}:${plan.status}`,
    metadata,
  });

  await registerLearningEvent(input, persisted ? "sales_profile_configured" : "sales_profile_setup_created", {
    summary: plan.summary,
    setup_status: plan.status,
    setup_completeness: plan.completeness,
    missing_signal_count: plan.missingSignals.length,
    drafted_signal_count: plan.draftedSignals.length,
    persisted,
    requires_human_review: plan.requiresHumanReview,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  });

  return {
    status: persistError ? "failed" : "executed",
    reply: buildSalesProfileSetupReply({
      status: plan.status,
      completeness: plan.completeness,
      idealClient: plan.profile.idealClient,
      coreSolution: plan.profile.coreSolution,
      puv: plan.profile.uniqueValueProposition,
      pillarCount: plan.profile.valuePillars.length,
      missingSignalCount: plan.missingSignals.length,
      nextQuestion: plan.nextQuestion,
      persisted,
    }),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      setup_status: plan.status,
      setup_completeness: plan.completeness,
      sales_profile_persisted: persisted,
      sales_profile_persist_error: persistError,
      missing_signal_count: plan.missingSignals.length,
      drafted_signal_count: plan.draftedSignals.length,
      next_question: plan.nextQuestion,
      requires_human_review: plan.requiresHumanReview,
      external_side_effects_blocked: plan.externalSideEffectsBlocked,
    },
    data: {
      plan,
      persisted,
    },
  };
}

async function runGrowthColdLeadReactivation(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildColdLeadReactivationInputFromEntities(input.entities);
  const maxLeads = Math.max(1, Math.min(50, Math.round(toNullableNumber(direct.maxLeads) || 20)));
  const candidates = await loadColdLeadCandidates({
    tenantId: input.tenantId,
    legalArea: direct.legalArea || direct.segment || null,
    maxLeads,
  });
  const plan = buildColdLeadReactivationPlan({
    ...direct,
    maxLeads,
    candidates,
  });
  const metadata = buildColdLeadReactivationArtifactMetadata(plan);

  await registerArtifact(input, {
    artifactType: "lead_reactivation_plan",
    title: `Reativacao - ${plan.segment}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `lead-reactivation:${input.auditLogId}`
      : `lead-reactivation:${plan.segment}:${plan.minDaysInactive}:${plan.candidateCount}`,
    metadata,
  });

  await registerLearningEvent(input, "lead_reactivation_plan_created", {
    summary: plan.summary,
    legal_area: plan.legalArea,
    segment: plan.segment,
    candidate_count: plan.candidateCount,
    message_variant_count: plan.messageVariants.length,
    next_best_action: plan.nextBestAction,
    requires_human_approval: plan.requiresHumanApproval,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  });

  return {
    status: "executed",
    reply: buildColdLeadReactivationReply({
      segment: plan.segment,
      candidateCount: plan.candidateCount,
      messageCount: plan.messageVariants.length,
      nextBestAction: plan.nextBestAction,
      requiresHumanApproval: plan.requiresHumanApproval,
    }),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      segment: plan.segment,
      legal_area: plan.legalArea,
      lead_reactivation_candidate_count: plan.candidateCount,
      lead_reactivation_message_count: plan.messageVariants.length,
      external_side_effects_blocked: plan.externalSideEffectsBlocked,
      requires_human_approval: plan.requiresHumanApproval,
    },
    data: {
      plan,
    },
  };
}

async function runGrowthMarketingOpsAssistant(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildMarketingOpsAssistantInputFromEntities(input.entities);
  const [state, crmTasks] = await Promise.all([
    loadMarketingOpsState(input.tenantId),
    loadMarketingOpsCrmTasks(input.tenantId),
  ]);

  const request = direct.request || input.history?.slice().reverse().find((item) => item.role === "user")?.content || null;
  const plan = buildMarketingOpsAssistantPlan({
    ...direct,
    request,
    state,
    crmTasks,
  });
  const metadata = buildMarketingOpsAssistantMetadata(plan);

  await registerArtifact(input, {
    artifactType: "marketing_ops_assistant_plan",
    title: "Growth por chat - Marketing OS",
    mimeType: "application/json",
    dedupeKey: input.auditLogId ? `marketing-ops:${input.auditLogId}` : `marketing-ops:${input.tenantId}:${plan.mode}`,
    metadata,
  });

  await registerLearningEvent(input, "marketing_ops_assistant_plan_created", {
    summary: plan.summary,
    mode: plan.mode,
    this_week_count: plan.thisWeek.length,
    approved_without_task_count: plan.approvedWithoutTask.length,
    leads_needing_next_step_count: plan.leadsNeedingNextStep.length,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
    requires_human_approval: plan.humanApprovalRequired,
  });

  const reply = [
    "## Growth por chat",
    plan.summary,
    plan.thisWeek.length > 0 ? `- Pautas da semana: ${plan.thisWeek.map((item) => `${item.date} ${item.channel} - ${item.title}`).join("; ")}` : "- Pautas da semana: nenhuma pauta ativa encontrada para os proximos 7 dias.",
    plan.approvedWithoutTask.length > 0 ? `- Aprovados sem tarefa: ${plan.approvedWithoutTask.map((item) => item.title).join("; ")}` : "- Aprovados sem tarefa: nenhum pendente encontrado.",
    plan.leadsNeedingNextStep.length > 0 ? `- Leads sem proximo passo: ${plan.leadsNeedingNextStep.map((lead) => lead.title).join("; ")}` : "- Leads sem proximo passo: nenhum alerta prioritario encontrado.",
    `- Proxima acao: ${plan.recommendedActions[0]}`,
    "- Side effects externos: bloqueados ate revisao humana.",
  ].join("\n");

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      mode: plan.mode,
      this_week_count: plan.thisWeek.length,
      approved_without_task_count: plan.approvedWithoutTask.length,
      leads_needing_next_step_count: plan.leadsNeedingNextStep.length,
      external_side_effects_blocked: plan.externalSideEffectsBlocked,
      requires_human_approval: plan.humanApprovalRequired,
    },
    data: {
      plan,
    },
  };
}

async function runGrowthMarketingCopywriter(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildMarketingCopywriterInputFromEntities(input.entities);
  const state = await loadMarketingOpsState(input.tenantId);
  const item = selectMarketingCopyItem(state, direct);
  const draft = buildMarketingCopywriterDraft({
    item,
    profile: (state as any).profile || null,
    references: Array.isArray((state as any).references) ? (state as any).references : [],
  });
  const metadata = buildMarketingCopywriterArtifactMetadata(draft);

  await registerArtifact(input, {
    artifactType: "marketing_copywriter_draft",
    title: `Copy - ${draft.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId ? `marketing-copy:${input.auditLogId}` : `marketing-copy:${input.tenantId}:${draft.attributionHint.contentId}`,
    metadata,
  });

  await registerLearningEvent(input, "marketing_copywriter_draft_created", {
    title: draft.title,
    channel: draft.channel,
    campaign_suggestion: draft.campaignSuggestion,
    risk_flag_count: draft.riskFlags.length,
    variant_count: draft.variants.length,
    requires_human_approval: draft.humanApprovalRequired,
    external_side_effects_blocked: draft.externalSideEffectsBlocked,
  });

  const reply = [
    "## Copy juridica supervisionada",
    `- Conteudo: ${draft.title}`,
    `- Canal: ${draft.channel}`,
    `- Headline: ${draft.headline}`,
    `- Hook: ${draft.hook}`,
    `- CTA: ${draft.cta}`,
    draft.riskFlags.length > 0 ? `- Alertas: ${draft.riskFlags.join("; ")}` : "- Alertas: nenhum alerta critico identificado.",
    `- Campanha sugerida: ${draft.campaignSuggestion}`,
    "- Side effects externos: bloqueados ate revisao humana.",
  ].join("\n");

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      channel: draft.channel,
      campaign_suggestion: draft.campaignSuggestion,
      risk_flag_count: draft.riskFlags.length,
      variant_count: draft.variants.length,
      requires_human_approval: draft.humanApprovalRequired,
      external_side_effects_blocked: draft.externalSideEffectsBlocked,
    },
    data: { draft },
  };
}

async function runGrowthLeadSchedule(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildLeadScheduleInputFromEntities(input.entities);
  const crmTask = await loadGrowthLeadCrmContext(input.tenantId, direct.crmTaskId || null);
  const plan = buildLeadSchedulePlan({
    crmTaskId: crmTask?.id || direct.crmTaskId || null,
    leadName: direct.leadName || crmTask?.title || null,
    legalArea: direct.legalArea || crmTask?.sector || null,
    pain: direct.pain || crmTask?.description || null,
    score: direct.score ?? crmTask?.lead_scoring ?? null,
    scheduledFor: direct.scheduledFor || null,
    meetingType: direct.meetingType || null,
    ownerId: direct.ownerId || crmTask?.assigned_to || null,
    ownerName: direct.ownerName || null,
    notes: direct.notes || null,
  });
  const crmTaskId = crmTask?.id || direct.crmTaskId || null;
  const agendaPayload = buildLeadScheduleAgendaPayload({
    tenantId: input.tenantId,
    crmTaskId,
    userId: input.userId || null,
    ownerId: direct.ownerId || crmTask?.assigned_to || null,
    ownerName: direct.ownerName || null,
    plan,
  });
  const agendaTaskId = await syncAgendaTaskBySource(serviceSupabase, agendaPayload);
  const metadata = buildLeadScheduleArtifactMetadata({
    crmTaskId,
    agendaTaskId: agendaTaskId ? String(agendaTaskId) : null,
    plan,
  });

  await registerArtifact(input, {
    artifactType: "lead_schedule_plan",
    title: `Agendamento - ${plan.leadName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `lead-schedule:${input.auditLogId}`
      : `lead-schedule:${crmTaskId || plan.leadName}:${plan.scheduledFor}`,
    metadata,
  });

  await registerLearningEvent(input, "lead_schedule_plan_created", {
    summary: plan.summary,
    crm_task_id: crmTaskId,
    agenda_task_id: agendaTaskId ? String(agendaTaskId) : null,
    lead_name: plan.leadName,
    legal_area: plan.legalArea,
    scheduled_for: plan.scheduledFor,
    meeting_type: plan.meetingType,
    urgency: plan.urgency,
    next_best_action: plan.nextBestAction,
    requires_human_approval: plan.requiresHumanApproval,
  });

  const reply = buildLeadScheduleReply({
    leadName: plan.leadName,
    scheduledFor: plan.scheduledFor,
    urgency: plan.urgency,
    agendaTaskId: agendaTaskId ? String(agendaTaskId) : null,
    nextBestAction: plan.nextBestAction,
  });

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: crmTaskId,
      agenda_task_id: agendaTaskId ? String(agendaTaskId) : null,
      lead_name: plan.leadName,
      scheduled_for: plan.scheduledFor,
      schedule_urgency: plan.urgency,
      requires_human_approval: plan.requiresHumanApproval,
    },
    data: {
      plan,
      agendaTaskId,
      crmTask,
    },
  };
}

async function runGrowthRevenueFlowPlan(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildRevenueFlowInputFromEntities(input.entities);
  const commercialContext = await resolveCommercialContext(input);
  const plan = buildRevenueFlowPlan({
    crmTaskId: direct.crmTaskId || commercialContext.crmTask?.id || null,
    clientName: direct.clientName || commercialContext.clientName || commercialContext.crmTask?.title || null,
    legalArea: direct.legalArea || commercialContext.crmTask?.sector || null,
    amount: direct.amount ?? commercialContext.amount ?? null,
    proposalReady: Boolean(commercialContext.proposalArtifact),
    contractReady: Boolean(commercialContext.contractArtifact),
    billingReady: Boolean(commercialContext.billingArtifact),
    paymentConfirmed: input.entities.payment_confirmed,
  });
  const metadata = buildRevenueFlowArtifactMetadata(plan);

  await registerArtifact(input, {
    artifactType: "revenue_flow_plan",
    title: `Revenue-to-case - ${plan.clientName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `revenue-flow:${input.auditLogId}`
      : `revenue-flow:${plan.crmTaskId || plan.clientName}`,
    metadata,
  });

  await registerLearningEvent(input, "revenue_flow_plan_created", {
    summary: plan.summary,
    crm_task_id: plan.crmTaskId,
    client_name: plan.clientName,
    legal_area: plan.legalArea,
    amount: plan.amount,
    step_count: plan.steps.length,
    next_best_action: plan.nextBestAction,
    blocked_reason: plan.blockedReason,
    requires_human_approval: plan.requiresHumanApproval,
  });

  return {
    status: "executed",
    reply: buildRevenueFlowReply({
      clientName: plan.clientName,
      nextBestAction: plan.nextBestAction,
      stepCount: plan.steps.length,
      blockedReason: plan.blockedReason,
    }),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: plan.crmTaskId,
      client_name: plan.clientName,
      revenue_flow_step_count: plan.steps.length,
      revenue_flow_blocked_reason: plan.blockedReason,
      requires_human_approval: plan.requiresHumanApproval,
    },
    data: { plan },
  };
}

async function runGrowthExternalActionPreview(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildExternalActionPreviewInputFromEntities(input.entities);
  const commercialContext = await resolveCommercialContext(input);
  const preview = buildExternalActionPreview({
    actionType: direct.actionType,
    clientName: direct.clientName || commercialContext.clientName || commercialContext.crmTask?.title || null,
    legalArea: direct.legalArea || commercialContext.crmTask?.sector || null,
    amount: direct.amount ?? commercialContext.amount ?? null,
    recipientName: direct.recipientName || commercialContext.clientName || null,
    recipientEmail: direct.recipientEmail || commercialContext.email || null,
    crmTaskId: direct.crmTaskId || commercialContext.crmTask?.id || null,
    notes: direct.notes || null,
  });
  const metadata = buildExternalActionPreviewMetadata(preview);

  await registerArtifact(input, {
    artifactType: "external_action_preview",
    title: `Preview externo - ${preview.clientName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `external-action-preview:${input.auditLogId}`
      : `external-action-preview:${preview.crmTaskId || preview.clientName}:${preview.actionType}`,
    metadata,
  });

  await registerLearningEvent(input, "external_action_preview_created", {
    summary: preview.summary,
    action_type: preview.actionType,
    client_name: preview.clientName,
    crm_task_id: preview.crmTaskId,
    blocker_count: preview.blockers.length,
    risk_level: preview.riskLevel,
    external_side_effects_blocked: preview.externalSideEffectsBlocked,
    next_best_action: preview.nextBestAction,
  });

  return {
    status: "executed",
    reply: buildExternalActionPreviewReply({
      actionType: preview.actionType,
      clientName: preview.clientName,
      blockerCount: preview.blockers.length,
      nextBestAction: preview.nextBestAction,
    }),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      action_type: preview.actionType,
      client_name: preview.clientName,
      crm_task_id: preview.crmTaskId,
      external_preview_blocker_count: preview.blockers.length,
      external_side_effects_blocked: preview.externalSideEffectsBlocked,
      requires_human_approval: preview.requiresHumanApproval,
    },
    data: { preview },
  };
}

async function runGrowthClientAcceptanceRecord(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildClientAcceptanceInputFromEntities(input.entities);
  const commercialContext = await resolveCommercialContext(input);
  const record = buildClientAcceptanceRecord({
    clientName: direct.clientName || commercialContext.clientName || commercialContext.crmTask?.title || null,
    crmTaskId: direct.crmTaskId || commercialContext.crmTask?.id || null,
    legalArea: direct.legalArea || commercialContext.crmTask?.sector || null,
    acceptanceType: direct.acceptanceType || null,
    acceptanceChannel: direct.acceptanceChannel || null,
    evidenceSummary: direct.evidenceSummary || null,
    amount: direct.amount ?? commercialContext.amount ?? null,
    acceptedAt: direct.acceptedAt || null,
  });
  const metadata = buildClientAcceptanceArtifactMetadata(record);
  const systemEvent = buildClientAcceptanceSystemEventPayload({
    record,
    userId: input.userId || null,
    auditLogId: input.auditLogId || null,
  });

  await serviceSupabase.from("system_event_logs").insert({
    tenant_id: input.tenantId,
    user_id: input.userId || null,
    source: "growth",
    provider: "mayus",
    event_name: systemEvent.event_name,
    status: systemEvent.status,
    payload: systemEvent.payload,
    created_at: new Date().toISOString(),
  });

  await registerArtifact(input, {
    artifactType: "client_acceptance_record",
    title: `Aceite - ${record.clientName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `client-acceptance:${input.auditLogId}`
      : `client-acceptance:${record.crmTaskId || record.clientName}:${record.acceptedAt}`,
    metadata,
  });

  await registerLearningEvent(input, "client_acceptance_record_created", {
    summary: record.summary,
    client_name: record.clientName,
    crm_task_id: record.crmTaskId,
    legal_area: record.legalArea,
    acceptance_type: record.acceptanceType,
    acceptance_channel: record.acceptanceChannel,
    amount: record.amount,
    accepted_at: record.acceptedAt,
    audit_status: record.auditStatus,
    external_side_effects_blocked: record.externalSideEffectsBlocked,
  });

  return {
    status: "executed",
    reply: buildClientAcceptanceReply({
      clientName: record.clientName,
      acceptanceType: record.acceptanceType,
      auditStatus: record.auditStatus,
      nextBestAction: record.nextBestAction,
    }),
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      client_name: record.clientName,
      crm_task_id: record.crmTaskId,
      acceptance_type: record.acceptanceType,
      client_acceptance_audit_status: record.auditStatus,
      external_side_effects_blocked: record.externalSideEffectsBlocked,
      requires_human_review: record.requiresHumanReview,
    },
    data: { record },
  };
}

async function runGrowthLeadQualify(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildLeadQualificationInputFromEntities(input.entities);
  const crmTask = await loadGrowthLeadCrmContext(input.tenantId, direct.crmTaskId || null);
  const plan = buildLeadQualificationPlan({
    crmTaskId: crmTask?.id || direct.crmTaskId || null,
    leadName: direct.leadName || crmTask?.title || null,
    legalArea: direct.legalArea || crmTask?.sector || null,
    pain: direct.pain || crmTask?.description || null,
    origin: crmTask?.source || null,
    score: direct.score ?? crmTask?.lead_scoring ?? null,
    tags: crmTask?.tags || null,
  });
  const metadata = buildLeadQualificationArtifactMetadata({
    crmTaskId: crmTask?.id || direct.crmTaskId || null,
    plan,
  });

  await registerArtifact(input, {
    artifactType: "lead_qualification_plan",
    title: `Qualificacao - ${plan.leadName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `lead-qualification:${input.auditLogId}`
      : `lead-qualification:${crmTask?.id || plan.leadName}:${plan.confidence}`,
    metadata,
  });

  await registerLearningEvent(input, "lead_qualification_plan_created", {
    summary: plan.summary,
    crm_task_id: crmTask?.id || direct.crmTaskId || null,
    lead_name: plan.leadName,
    legal_area: plan.legalArea,
    confidence: plan.confidence,
    risk_flags: plan.riskFlags,
    next_best_action: plan.nextBestAction,
    requires_human_handoff: plan.requiresHumanHandoff,
  });

  const reply = buildLeadQualificationReply({
    leadName: plan.leadName,
    confidence: plan.confidence,
    nextBestAction: plan.nextBestAction,
    minimumDocuments: plan.minimumDocuments,
    riskFlags: plan.riskFlags,
  });

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: crmTask?.id || direct.crmTaskId || null,
      lead_name: plan.leadName,
      qualification_confidence: plan.confidence,
      lead_requires_human_handoff: plan.requiresHumanHandoff,
      risk_flag_count: plan.riskFlags.length,
    },
    data: {
      plan,
      crmTask,
    },
  };
}

async function runGrowthLeadFollowup(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const direct = buildLeadFollowupInputFromEntities(input.entities);
  const crmTask = await loadGrowthLeadCrmContext(input.tenantId, direct.crmTaskId || null);
  const plan = buildLeadFollowupPlan({
    crmTaskId: crmTask?.id || direct.crmTaskId || null,
    leadName: direct.leadName || crmTask?.title || null,
    legalArea: direct.legalArea || crmTask?.sector || null,
    pain: direct.pain || crmTask?.description || null,
    origin: crmTask?.source || null,
    score: direct.score ?? crmTask?.lead_scoring ?? null,
    goal: direct.goal || null,
    tags: crmTask?.tags || null,
  });
  const crmTaskId = crmTask?.id || direct.crmTaskId || null;
  const metadata = buildLeadFollowupArtifactMetadata({
    crmTaskId,
    plan,
  });

  await registerArtifact(input, {
    artifactType: "lead_followup_plan",
    title: `Follow-up - ${plan.leadName}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `lead-followup:${input.auditLogId}`
      : `lead-followup:${crmTaskId || plan.leadName}:${plan.priority}`,
    metadata,
  });

  await registerLearningEvent(input, "lead_followup_plan_created", {
    summary: plan.summary,
    crm_task_id: crmTaskId,
    lead_name: plan.leadName,
    legal_area: plan.legalArea,
    followup_priority: plan.priority,
    cadence_step_count: plan.cadence.length,
    next_best_action: plan.nextBestAction,
    requires_human_approval: plan.requiresHumanApproval,
  });

  const reply = buildLeadFollowupReply({
    leadName: plan.leadName,
    priority: plan.priority,
    nextBestAction: plan.nextBestAction,
    cadenceStepCount: plan.cadence.length,
    requiresHumanApproval: plan.requiresHumanApproval,
  });

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: crmTaskId,
      lead_name: plan.leadName,
      followup_priority: plan.priority,
      cadence_step_count: plan.cadence.length,
      requires_human_approval: plan.requiresHumanApproval,
    },
    data: {
      plan,
      crmTask,
    },
  };
}

async function runGrowthLeadIntake(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const result = analyzeLeadIntake(buildLeadIntakeInputFromEntities(input.entities));
  const pipelineId = await getOrCreateGrowthPipeline(input.tenantId);
  const stageId = await getGrowthDefaultStageId(pipelineId);
  const taskPayload = buildCrmTaskPayload({
    tenantId: input.tenantId,
    pipelineId,
    stageId,
    result,
  });

  const { data: crmTask, error: crmTaskError } = await serviceSupabase
    .from("crm_tasks")
    .insert(taskPayload)
    .select("id, pipeline_id")
    .single();

  if (crmTaskError || !crmTask?.id) throw crmTaskError || new Error("crm_task_missing");

  const eventPayload = buildLeadIntakeEventPayload({
    crmTaskId: String(crmTask.id),
    result,
  });

  await serviceSupabase.from("system_event_logs").insert({
    tenant_id: input.tenantId,
    user_id: input.userId || null,
    source: "growth",
    provider: "mayus",
    event_name: result.kind === "referral" ? "referral_intake_created" : "lead_intake_created",
    status: "ok",
    payload: eventPayload,
    created_at: new Date().toISOString(),
  });

  const artifactType = result.kind === "referral" ? "referral_intake" : "lead_intake";
  const metadata = result.kind === "referral"
    ? buildReferralIntakeArtifactMetadata({ crmTaskId: String(crmTask.id), result })
    : {
        summary: `Lead registrado no CRM para ${result.normalized.name}. Proximo passo: ${result.nextStep}`,
        crm_task_id: String(crmTask.id),
        kind: result.kind,
        score: result.score,
        score_reason: result.scoreReason,
        tags: result.tags,
        next_step: result.nextStep,
        needs_human_handoff: result.needsHumanHandoff,
        lead_name: result.normalized.name,
        phone_present: Boolean(result.normalized.phone),
        email_present: Boolean(result.normalized.email),
        legal_area: result.normalized.legalArea,
        urgency: result.normalized.urgency,
        origin: result.normalized.origin,
        channel: result.normalized.channel,
        requires_human_action: result.needsHumanHandoff,
        human_actions: result.needsHumanHandoff ? [result.nextStep] : [],
      };

  await registerArtifact(input, {
    artifactType,
    title: result.kind === "referral"
      ? `Indicacao registrada - ${result.normalized.name}`
      : `Lead registrado - ${result.normalized.name}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `${artifactType}:${input.auditLogId}`
      : `${artifactType}:${crmTask.id}`,
    metadata,
  });

  await registerLearningEvent(input, result.kind === "referral" ? "referral_intake_artifact_created" : "lead_intake_artifact_created", {
    summary: metadata.summary,
    crm_task_id: String(crmTask.id),
    kind: result.kind,
    score: result.score,
    next_step: result.nextStep,
    needs_human_handoff: result.needsHumanHandoff,
  });

  const reply = buildLeadIntakeReply({
    kind: result.kind,
    score: result.score,
    leadName: result.normalized.name,
    nextStep: result.nextStep,
    needsHumanHandoff: result.needsHumanHandoff,
    crmTaskId: String(crmTask.id),
  });

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      crm_task_id: String(crmTask.id),
      pipeline_id: String(crmTask.pipeline_id || pipelineId),
      lead_kind: result.kind,
      lead_score: result.score,
      lead_needs_human_handoff: result.needsHumanHandoff,
    },
    data: {
      crmTaskId: String(crmTask.id),
      analysis: result,
    },
  };
}

async function runLegalCaseContext(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshot = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processMissionContext = buildProcessMissionContext(snapshot);
  const reply = buildLegalCaseContextReply(snapshot);
  const summary = `Contexto juridico resolvido para ${snapshot.processTask.processNumber || snapshot.processTask.title}.`;

  await registerArtifact(input, {
    artifactType: "legal_case_context",
    title: `Contexto juridico - ${snapshot.processTask.clientName || snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `legal-case-context:${input.auditLogId}`
      : `legal-case-context:${snapshot.processTask.id}:${snapshot.caseBrain.taskId || "sem-case-brain"}:${snapshot.firstDraft.artifactId || "sem-minuta"}:${snapshot.firstDraft.status}`,
    metadata: {
      reply,
      summary,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      client_name: snapshot.processTask.clientName,
      legal_area: snapshot.processTask.legalArea,
      case_brain_task_id: snapshot.caseBrain.taskId,
      case_id: snapshot.caseBrain.caseId,
      recommended_piece_input: snapshot.caseBrain.recommendedPieceInput,
      recommended_piece_label: snapshot.caseBrain.recommendedPieceLabel,
      first_draft_status: snapshot.firstDraft.status,
      first_draft_stale: snapshot.firstDraft.isStale,
      first_draft_artifact_id: snapshot.firstDraft.artifactId,
      process_mission_context: processMissionContext,
    },
  });

  await registerLearningEvent(input, "legal_case_context_resolved", {
    summary,
    process_task_id: snapshot.processTask.id,
    process_number: snapshot.processTask.processNumber,
    client_name: snapshot.processTask.clientName,
    case_brain_task_id: snapshot.caseBrain.taskId,
    recommended_piece_label: snapshot.caseBrain.recommendedPieceLabel,
    first_draft_status: snapshot.firstDraft.status,
    first_draft_stale: snapshot.firstDraft.isStale,
    process_mission_confidence: processMissionContext.confidence,
    process_mission_recommended_action: processMissionContext.recommendedAction,
  });

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      process_task_id: snapshot.processTask.id,
      case_brain_task_id: snapshot.caseBrain.taskId,
      first_draft_status: snapshot.firstDraft.status,
      first_draft_stale: snapshot.firstDraft.isStale,
      recommended_piece_label: snapshot.caseBrain.recommendedPieceLabel,
      process_mission_confidence: processMissionContext.confidence,
      process_mission_recommended_action: processMissionContext.recommendedAction,
      process_mission_goal: processMissionContext.missionGoal,
    },
    data: snapshot,
  };
}

function formatProcessMissionRecommendedAction(action: ReturnType<typeof buildProcessMissionContext>["recommendedAction"]) {
  switch (action) {
    case "refresh_document_memory":
      return "Atualizar memoria documental";
    case "generate_first_draft":
      return "Gerar primeira minuta";
    case "review_existing_draft":
      return "Revisar minuta existente";
    case "collect_missing_documents":
      return "Coletar/organizar documentos pendentes";
    case "human_review":
      return "Revisao humana antes de agir";
    default:
      return "Consolidar contexto do caso";
  }
}

function buildProcessMissionPlanReply(context: ReturnType<typeof buildProcessMissionContext>) {
  const processLabel = context.process.processNumber || context.process.title;
  return [
    "## Missao agentica do processo",
    `- Processo: ${processLabel}`,
    context.process.clientName ? `- Cliente: ${context.process.clientName}` : null,
    context.status.currentPhase ? `- Fase atual: ${context.status.currentPhase}` : null,
    context.status.progressSummary ? `- Resumo operacional: ${context.status.progressSummary}` : null,
    `- Confianca: ${context.confidence}`,
    `- Acao recomendada: ${formatProcessMissionRecommendedAction(context.recommendedAction)}`,
    `- Objetivo da missao: ${context.missionGoal}`,
    context.status.nextStep ? `- Proximo passo: ${context.status.nextStep}` : null,
    context.status.pendingItems.length > 0
      ? `- Pendencias: ${context.status.pendingItems.join("; ")}`
      : "- Pendencias: nenhuma pendencia critica registrada",
    `- Memoria documental: ${context.documents.freshness}${context.documents.lastSyncedAt ? ` em ${formatDateTimeLabel(context.documents.lastSyncedAt)}` : ""}`,
    context.draft.recommendedPiece ? `- Peca/minuta sugerida: ${context.draft.recommendedPiece}` : null,
    context.grounding.factualSources.length > 0
      ? `- Fontes: ${context.grounding.factualSources.join("; ")}`
      : null,
    context.grounding.inferenceNotes.length > 0
      ? `- Inferencias: ${context.grounding.inferenceNotes.join("; ")}`
      : "- Inferencias: sem inferencias relevantes",
    context.grounding.missingSignals.length > 0
      ? `- Sinais faltantes: ${context.grounding.missingSignals.join("; ")}`
      : null,
    "- Execucao: plano registrado sem side effects externos. Acoes juridicas, Drive, minuta, publicacao ou comunicacao externa seguem supervisionadas.",
  ].filter(Boolean).join("\n");
}

async function runLegalProcessMissionPlan(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshot = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processMissionContext = buildProcessMissionContext(snapshot);
  const reply = buildProcessMissionPlanReply(processMissionContext);
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;
  const summary = `Missao agentica planejada para ${processLabel}: ${formatProcessMissionRecommendedAction(processMissionContext.recommendedAction)}.`;

  await registerArtifact(input, {
    artifactType: "process_mission_plan",
    title: `Missao processual - ${snapshot.processTask.clientName || snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `process-mission-plan:${input.auditLogId}`
      : `process-mission-plan:${snapshot.processTask.id}:${processMissionContext.recommendedAction}:${processMissionContext.confidence}`,
    metadata: {
      reply,
      summary,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: snapshot.processTask.clientName,
      case_brain_task_id: snapshot.caseBrain.taskId,
      process_mission_context: processMissionContext,
      process_mission_confidence: processMissionContext.confidence,
      process_mission_recommended_action: processMissionContext.recommendedAction,
      process_mission_goal: processMissionContext.missionGoal,
      external_side_effects_blocked: true,
    },
  });

  await registerLearningEvent(input, "process_mission_plan_created", {
    summary,
    process_task_id: snapshot.processTask.id,
    process_number: snapshot.processTask.processNumber,
    client_name: snapshot.processTask.clientName,
    case_brain_task_id: snapshot.caseBrain.taskId,
    confidence: processMissionContext.confidence,
    recommended_action: processMissionContext.recommendedAction,
    mission_goal: processMissionContext.missionGoal,
    factual_sources: processMissionContext.grounding.factualSources,
    inference_notes: processMissionContext.grounding.inferenceNotes,
    missing_signals: processMissionContext.grounding.missingSignals,
    external_side_effects_blocked: true,
  });

  return {
    status: "executed",
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      case_brain_task_id: snapshot.caseBrain.taskId,
      process_mission_confidence: processMissionContext.confidence,
      process_mission_recommended_action: processMissionContext.recommendedAction,
      process_mission_goal: processMissionContext.missionGoal,
      factual_source_count: processMissionContext.grounding.factualSources.length,
      missing_signal_count: processMissionContext.grounding.missingSignals.length,
      external_side_effects_blocked: true,
    },
    data: {
      snapshot,
      processMissionContext,
    },
  };
}

function buildProcessMissionExecutionBlockedReply(params: {
  context: ReturnType<typeof buildProcessMissionContext>;
  reason: string;
}) {
  const processLabel = params.context.process.processNumber || params.context.process.title;
  return [
    "## Execucao da missao processual",
    `- Processo: ${processLabel}`,
    `- Status: bloqueada para supervisao`,
    `- Motivo: ${params.reason}`,
    `- Confianca: ${params.context.confidence}`,
    `- Acao recomendada: ${formatProcessMissionRecommendedAction(params.context.recommendedAction)}`,
    `- Objetivo da missao: ${params.context.missionGoal}`,
    "- Execucao: nenhum side effect externo foi realizado.",
  ].join("\n");
}

function buildProcessMissionApprovalReply(params: {
  context: ReturnType<typeof buildProcessMissionContext>;
  proposedCapability: string;
  proposedActionLabel: string;
}) {
  const processLabel = params.context.process.processNumber || params.context.process.title;
  return [
    "## Missao juridica supervisionada",
    `- Processo: ${processLabel}`,
    params.context.process.clientName ? `- Cliente: ${params.context.process.clientName}` : null,
    `- Status: aguardando aprovacao humana`,
    `- Acao proposta: ${params.proposedActionLabel}`,
    `- Capability proposta: ${params.proposedCapability}`,
    `- Confianca: ${params.context.confidence}`,
    `- Objetivo da missao: ${params.context.missionGoal}`,
    params.context.draft.recommendedPiece ? `- Peca sugerida: ${params.context.draft.recommendedPiece}` : null,
    params.context.grounding.factualSources.length > 0
      ? `- Fontes: ${params.context.grounding.factualSources.join("; ")}`
      : null,
    params.context.grounding.missingSignals.length > 0
      ? `- Lacunas/sinais faltantes: ${params.context.grounding.missingSignals.join("; ")}`
      : "- Lacunas/sinais faltantes: nenhuma lacuna critica registrada",
    "- Guardrail: nenhuma minuta foi gerada ainda. A Draft Factory juridica so sera chamada se um aprovador autorizar.",
  ].filter(Boolean).join("\n");
}

function buildProcessMissionApprovalAuditKey(input: DispatchCapabilityInput, context: ReturnType<typeof buildProcessMissionContext>) {
  const raw = [
    input.tenantId,
    input.userId || "system",
    input.auditLogId || "no-audit",
    context.process.processTaskId,
    context.recommendedAction,
    Date.now(),
    crypto.randomUUID(),
  ].join(":");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function requestProcessMissionDraftApproval(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    context: ReturnType<typeof buildProcessMissionContext>;
  }
): Promise<DispatchCapabilityResult> {
  const proposedCapability = "legal_first_draft_generate";
  const proposedHandlerType = "lex_first_draft_generate";
  const proposedActionLabel = "Gerar primeira minuta juridica";
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const reply = buildProcessMissionApprovalReply({
    context: params.context,
    proposedCapability,
    proposedActionLabel,
  });
  const summary = `Missao processual de ${processLabel} pediu aprovacao para gerar primeira minuta.`;
  const pendingEntities: Record<string, string> = {
    process_task_id: params.snapshot.processTask.id,
  };

  if (params.snapshot.processTask.processNumber) {
    pendingEntities.process_number = params.snapshot.processTask.processNumber;
  }
  if (params.snapshot.caseBrain.recommendedPieceInput) {
    pendingEntities.recommended_piece_input = params.snapshot.caseBrain.recommendedPieceInput;
  }
  if (params.snapshot.caseBrain.recommendedPieceLabel) {
    pendingEntities.recommended_piece_label = params.snapshot.caseBrain.recommendedPieceLabel;
  }

  if (!input.userId) {
    const errorMessage = "Nao foi possivel abrir aprovacao juridica sem usuario solicitante autenticado.";
    const blockedReply = buildProcessMissionExecutionBlockedReply({
      context: params.context,
      reason: errorMessage,
    });
    await registerProcessMissionStepResult(input, {
      context: params.context,
      status: "failed",
      reply: blockedReply,
      summary: `Falha ao abrir aprovacao para ${processLabel}.`,
      errorMessage,
    });

    return {
      status: "failed",
      reply: blockedReply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: params.snapshot.processTask.id,
        process_number: params.snapshot.processTask.processNumber,
        process_mission_confidence: params.context.confidence,
        process_mission_recommended_action: params.context.recommendedAction,
        proposed_capability: proposedCapability,
        approval_error: errorMessage,
        external_side_effects_blocked: true,
      },
      data: { snapshot: params.snapshot, processMissionContext: params.context },
    };
  }

  const idempotencyKey = buildProcessMissionApprovalAuditKey(input, params.context);
  const { id: approvalAuditLogId, error } = await createAgentAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    skillInvoked: proposedCapability,
    intentionRaw: `Missao processual supervisionada: ${proposedActionLabel} para ${processLabel}`,
    status: "awaiting_approval",
    idempotencyKey,
    approvalStatus: "pending",
    approvalContext: {
      risk_level: "high",
      source_capability: input.capabilityName,
      source_handler_type: input.handlerType,
      proposed_capability: proposedCapability,
      proposed_handler_type: proposedHandlerType,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      client_name: params.snapshot.processTask.clientName,
      recommended_piece_label: params.snapshot.caseBrain.recommendedPieceLabel,
      mission_goal: params.context.missionGoal,
      confidence: params.context.confidence,
      factual_sources: params.context.grounding.factualSources,
      missing_signals: params.context.grounding.missingSignals,
      requested_at: new Date().toISOString(),
    },
    pendingExecutionPayload: {
      entities: pendingEntities,
      idempotencyKey,
      skillName: proposedCapability,
      schemaVersion: "1.0.0",
      source: "legal_process_mission_execute_next",
    },
    idempotencyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error || !approvalAuditLogId) {
    const errorMessage = error || "Nao foi possivel criar a aprovacao supervisionada da minuta.";
    const blockedReply = buildProcessMissionExecutionBlockedReply({
      context: params.context,
      reason: errorMessage,
    });
    await registerProcessMissionStepResult(input, {
      context: params.context,
      status: "failed",
      reply: blockedReply,
      summary: `Falha ao abrir aprovacao para ${processLabel}.`,
      errorMessage,
    });

    return {
      status: "failed",
      reply: blockedReply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: params.snapshot.processTask.id,
        process_number: params.snapshot.processTask.processNumber,
        process_mission_confidence: params.context.confidence,
        process_mission_recommended_action: params.context.recommendedAction,
        proposed_capability: proposedCapability,
        approval_error: errorMessage,
        external_side_effects_blocked: true,
      },
      data: { snapshot: params.snapshot, processMissionContext: params.context },
    };
  }

  await registerProcessMissionStepResult(input, {
    context: params.context,
    status: "blocked",
    reply,
    summary,
    executedCapability: proposedCapability,
    executedHandlerType: proposedHandlerType,
    stepOutputPayload: {
      approval_audit_log_id: approvalAuditLogId,
      proposed_capability: proposedCapability,
      proposed_handler_type: proposedHandlerType,
      proposed_entities: pendingEntities,
      external_side_effects_blocked: true,
    },
  });

  return {
    status: "awaiting_approval",
    reply,
    outputPayload: {
      auditLogId: approvalAuditLogId,
      sourceAuditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      process_mission_confidence: params.context.confidence,
      process_mission_recommended_action: params.context.recommendedAction,
      process_mission_goal: params.context.missionGoal,
      proposed_capability: proposedCapability,
      proposed_handler_type: proposedHandlerType,
      proposed_action_label: proposedActionLabel,
      recommended_piece_label: params.snapshot.caseBrain.recommendedPieceLabel,
      approval_required: true,
      external_side_effects_blocked: true,
      awaitingPayload: {
        idempotencyKey,
        entities: pendingEntities,
        skillName: proposedCapability,
        riskLevel: "high",
        schemaVersion: "1.0.0",
        reason: "Geracao de minuta juridica exige aprovacao humana antes de chamar a Draft Factory.",
        proposedActionLabel,
        processLabel,
        missionGoal: params.context.missionGoal,
      },
    },
    data: {
      snapshot: params.snapshot,
      processMissionContext: params.context,
      proposedCapability,
      approvalAuditLogId,
    },
  };
}

async function registerProcessMissionStepResult(
  input: DispatchCapabilityInput,
  params: {
    context: ReturnType<typeof buildProcessMissionContext>;
    status: "executed" | "blocked" | "failed";
    reply: string;
    summary: string;
    executedCapability?: string | null;
    executedHandlerType?: string | null;
    errorMessage?: string | null;
    stepOutputPayload?: Record<string, unknown> | null;
  }
) {
  const processLabel = params.context.process.processNumber || params.context.process.title;
  await registerArtifact(input, {
    artifactType: "process_mission_step_result",
    title: `Resultado da missao processual - ${params.context.process.clientName || params.context.process.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `process-mission-step-result:${input.auditLogId}`
      : `process-mission-step-result:${params.context.process.processTaskId}:${params.context.recommendedAction}:${params.status}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.status,
      process_task_id: params.context.process.processTaskId,
      process_number: params.context.process.processNumber,
      process_label: processLabel,
      client_name: params.context.process.clientName,
      process_mission_context: params.context,
      process_mission_confidence: params.context.confidence,
      process_mission_recommended_action: params.context.recommendedAction,
      process_mission_goal: params.context.missionGoal,
      executed_capability: params.executedCapability || null,
      executed_handler_type: params.executedHandlerType || null,
      step_output_payload: params.stepOutputPayload || null,
      error_message: params.errorMessage || null,
    },
  });

  await registerLearningEvent(input, "process_mission_step_executed", {
    summary: params.summary,
    result_status: params.status,
    process_task_id: params.context.process.processTaskId,
    process_number: params.context.process.processNumber,
    client_name: params.context.process.clientName,
    confidence: params.context.confidence,
    recommended_action: params.context.recommendedAction,
    mission_goal: params.context.missionGoal,
    executed_capability: params.executedCapability || null,
    executed_handler_type: params.executedHandlerType || null,
    error_message: params.errorMessage || null,
  });
}

async function runLegalProcessMissionExecuteNext(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshot = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processMissionContext = buildProcessMissionContext(snapshot);
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;

  if (processMissionContext.confidence === "low") {
    const reason = "a base do processo ainda esta fraca para execucao automatica";
    const reply = buildProcessMissionExecutionBlockedReply({ context: processMissionContext, reason });
    const summary = `Missao processual de ${processLabel} bloqueada por baixa confianca.`;
    await registerProcessMissionStepResult(input, {
      context: processMissionContext,
      status: "blocked",
      reply,
      summary,
      errorMessage: reason,
    });

    return {
      status: "blocked",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        process_mission_confidence: processMissionContext.confidence,
        process_mission_recommended_action: processMissionContext.recommendedAction,
        blocked_reason: "low_confidence_process_mission",
        external_side_effects_blocked: true,
      },
      data: { snapshot, processMissionContext },
    };
  }

  if (processMissionContext.recommendedAction === "generate_first_draft") {
    return requestProcessMissionDraftApproval(input, {
      snapshot,
      context: processMissionContext,
    });
  }

  if (processMissionContext.recommendedAction !== "refresh_document_memory") {
    const reason = `a acao ${formatProcessMissionRecommendedAction(processMissionContext.recommendedAction)} ainda exige supervisao explicita nesta fase`;
    const reply = buildProcessMissionExecutionBlockedReply({ context: processMissionContext, reason });
    const summary = `Missao processual de ${processLabel} bloqueada: ${processMissionContext.recommendedAction} ainda nao executa automaticamente.`;
    await registerProcessMissionStepResult(input, {
      context: processMissionContext,
      status: "blocked",
      reply,
      summary,
      errorMessage: reason,
    });

    return {
      status: "blocked",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        process_mission_confidence: processMissionContext.confidence,
        process_mission_recommended_action: processMissionContext.recommendedAction,
        blocked_reason: "recommended_action_requires_supervision",
        external_side_effects_blocked: true,
      },
      data: { snapshot, processMissionContext },
    };
  }

  const refreshResult = await runLegalDocumentMemoryRefresh({
    ...input,
    capabilityName: "legal_document_memory_refresh",
    handlerType: "lex_document_memory_refresh",
    entities: { ...input.entities, process_task_id: snapshot.processTask.id },
  });
  const summary = refreshResult.status === "executed"
    ? `Missao processual de ${processLabel} executou atualizacao de memoria documental.`
    : `Missao processual de ${processLabel} tentou atualizar memoria documental, mas terminou com status ${refreshResult.status}.`;
  const reply = [
    "## Execucao da missao processual",
    `- Processo: ${processLabel}`,
    `- Acao executada: ${formatProcessMissionRecommendedAction(processMissionContext.recommendedAction)}`,
    `- Status da acao: ${refreshResult.status}`,
    "",
    refreshResult.reply,
  ].filter(Boolean).join("\n");

  await registerProcessMissionStepResult(input, {
    context: processMissionContext,
    status: refreshResult.status === "executed" ? "executed" : refreshResult.status === "failed" ? "failed" : "blocked",
    reply,
    summary,
    executedCapability: "legal_document_memory_refresh",
    executedHandlerType: "lex_document_memory_refresh",
    stepOutputPayload: refreshResult.outputPayload || null,
  });

  return {
    status: refreshResult.status,
    reply,
    outputPayload: {
      auditLogId: input.auditLogId || null,
      handler_type: input.handlerType,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      process_mission_confidence: processMissionContext.confidence,
      process_mission_recommended_action: processMissionContext.recommendedAction,
      executed_capability: "legal_document_memory_refresh",
      executed_handler_type: "lex_document_memory_refresh",
      step_status: refreshResult.status,
      step_output_payload: refreshResult.outputPayload || null,
    },
    data: {
      snapshot,
      processMissionContext,
      refreshResult,
    },
  };
}

async function runSupportCaseStatus(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  try {
    const snapshot = await getLegalCaseContextSnapshot({
      tenantId: input.tenantId,
      entities: input.entities,
    });
    const processMissionContext = buildProcessMissionContext(snapshot);
    const contract = buildSupportCaseStatusContract(snapshot);
    const reply = buildSupportCaseStatusReply(contract);
    const summary = contract.responseMode === "handoff"
      ? `Status do caso ${contract.processLabel} encaminhado para handoff humano.`
      : `Status do caso ${contract.processLabel} preparado com confianca ${contract.confidence}.`;

    await registerArtifact(input, {
      artifactType: "support_case_status",
      title: `Status do caso - ${snapshot.processTask.clientName || snapshot.processTask.title}`,
      mimeType: "application/json",
      dedupeKey: input.auditLogId
        ? `support-case-status:${input.auditLogId}`
        : `support-case-status:${snapshot.processTask.id}:${snapshot.caseBrain.taskId || "sem-case-brain"}:${contract.responseMode}:${contract.confidence}`,
      metadata: {
        reply,
        summary,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        process_label: contract.processLabel,
        client_name: snapshot.processTask.clientName,
        case_brain_task_id: snapshot.caseBrain.taskId,
        case_id: snapshot.caseBrain.caseId,
        support_status_response_mode: contract.responseMode,
        support_status_confidence: contract.confidence,
        support_status_progress_summary: contract.progressSummary,
        support_status_current_phase: contract.currentPhase,
        support_status_next_step: contract.nextStep,
        support_status_pending_items: contract.pendingItems,
        support_status_factual_sources: contract.grounding.factualSources,
        support_status_inference_notes: contract.grounding.inferenceNotes,
        support_status_missing_signals: contract.grounding.missingSignals,
        support_status_handoff_reason: contract.handoffReason,
        process_mission_context: processMissionContext,
      },
    });

    await registerLearningEvent(input, "support_case_status_resolved", {
      reply,
      summary,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      process_label: contract.processLabel,
      client_name: snapshot.processTask.clientName,
      case_brain_task_id: snapshot.caseBrain.taskId,
      response_mode: contract.responseMode,
      confidence: contract.confidence,
      progress_summary: contract.progressSummary,
      current_phase: contract.currentPhase,
      next_step: contract.nextStep,
      pending_items: contract.pendingItems,
      factual_sources: contract.grounding.factualSources,
      inference_notes: contract.grounding.inferenceNotes,
      missing_signals: contract.grounding.missingSignals,
      handoff_reason: contract.handoffReason,
      process_mission_confidence: processMissionContext.confidence,
      process_mission_recommended_action: processMissionContext.recommendedAction,
    });

    return {
      status: "executed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
        support_status_response_mode: contract.responseMode,
        support_status_confidence: contract.confidence,
        support_status_progress_summary: contract.progressSummary,
        support_status_current_phase: contract.currentPhase,
        support_status_next_step: contract.nextStep,
        support_status_pending_count: contract.pendingItems.length,
        support_status_factual_source_count: contract.grounding.factualSources.length,
        support_status_inference_count: contract.grounding.inferenceNotes.length,
        support_status_missing_signal_count: contract.grounding.missingSignals.length,
        support_status_handoff_reason: contract.handoffReason,
        process_mission_confidence: processMissionContext.confidence,
        process_mission_recommended_action: processMissionContext.recommendedAction,
        process_mission_goal: processMissionContext.missionGoal,
      },
      data: {
        snapshot,
        contract,
        processMissionContext,
      },
    };
  } catch (error) {
    const processLabel = getStringValue(input.entities.process_number)
      || getStringValue(input.entities.process_reference)
      || getStringValue(input.entities.client_name)
      || "caso nao identificado";
    const errorMessage = error instanceof Error ? error.message : "support_case_status_failed";
    const handoffReason = /mais de um processo juridico/i.test(errorMessage)
      ? "ambiguous_case_match"
      : "case_not_identified";
    const reply = [
      "## Status do caso",
      `- Processo: ${processLabel}`,
      "- Nao consegui confirmar com seguranca qual e o caso correto para esta consulta.",
      "- Encaminhamento: handoff humano recomendado antes de responder o cliente.",
    ].join("\n");

    await registerArtifact(input, {
      artifactType: "support_case_status",
      title: `Status do caso - ${processLabel}`,
      mimeType: "application/json",
      dedupeKey: input.auditLogId ? `support-case-status:${input.auditLogId}` : `support-case-status:${processLabel}:handoff`,
      metadata: {
        reply,
        summary: `Status do caso ${processLabel} encaminhado para handoff por falha de identificacao.`,
        process_label: processLabel,
        support_status_response_mode: "handoff",
        support_status_confidence: "low",
        support_status_handoff_reason: handoffReason,
        error_message: errorMessage,
      },
    });

    await registerLearningEvent(input, "support_case_status_resolved", {
      reply,
      summary: `Status do caso ${processLabel} encaminhado para handoff por falha de identificacao.`,
      process_label: processLabel,
      response_mode: "handoff",
      confidence: "low",
      handoff_reason: handoffReason,
      error_message: errorMessage,
    });

    return {
      status: "executed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        support_status_response_mode: "handoff",
        support_status_confidence: "low",
        support_status_handoff_reason: handoffReason,
        error_message: errorMessage,
      },
      data: null,
    };
  }
}

async function registerLegalFirstDraftResultArtifact(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    reply: string;
    summary: string;
    resultStatus: "missing_draft_plan" | "running" | "completed" | "failed";
    execution?: DraftFactoryExecutionResult | null;
    firstDraftStaleBefore?: boolean;
    errorMessage?: string | null;
  }
) {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const pieceLabel = params.execution?.recommendedPieceLabel
    || params.execution?.result.pieceLabel
    || params.snapshot.caseBrain.recommendedPieceLabel
    || params.snapshot.firstDraft.pieceLabel
    || null;
  const artifactId = params.execution?.artifactId || params.snapshot.firstDraft.artifactId || null;

  await registerArtifact(input, {
    artifactType: "legal_first_draft_result",
    title: `Primeira minuta - ${params.snapshot.processTask.clientName || params.snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `legal-first-draft:${input.auditLogId}`
      : `legal-first-draft:${params.snapshot.processTask.id}:${params.snapshot.caseBrain.taskId || "sem-case-brain"}:${artifactId || params.resultStatus}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.resultStatus,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: params.snapshot.processTask.clientName,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      case_id: params.snapshot.caseBrain.caseId,
      recommended_piece_input: params.snapshot.caseBrain.recommendedPieceInput,
      recommended_piece_label: pieceLabel,
      first_draft_status: params.snapshot.firstDraft.status,
      first_draft_stale: params.snapshot.firstDraft.isStale,
      first_draft_stale_before: params.firstDraftStaleBefore ?? params.snapshot.firstDraft.isStale,
      first_draft_artifact_id: artifactId,
      case_first_draft_artifact_id: artifactId,
      draft_factory_task_id: params.execution?.draftFactoryTaskId || params.snapshot.firstDraft.taskId,
      already_existing: params.execution?.alreadyExisting === true,
      requires_human_review: params.execution?.result.requiresHumanReview ?? params.snapshot.firstDraft.requiresHumanReview,
      piece_label: pieceLabel,
      error_message: params.errorMessage || params.snapshot.firstDraft.error || null,
    },
  });
}

async function runLegalDocumentMemoryRefresh(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshotBefore = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processLabel = snapshotBefore.processTask.processNumber || snapshotBefore.processTask.title;

  try {
    const task = await loadProcessTaskDocumentContext(input.tenantId, snapshotBefore.processTask.id);
    if (!task?.drive_folder_id) {
      const reply = `O processo ${processLabel} ainda nao tem uma pasta documental pronta no Google Drive. Crie a estrutura documental antes de sincronizar.`;
      await registerLegalDocumentMemoryRefreshArtifact(input, {
        snapshot: snapshotBefore,
        reply,
        summary: reply,
        documentCount: snapshotBefore.documentMemory.documentCount,
        warnings: [],
        resultStatus: "failed",
        errorMessage: reply,
      });

      return {
        status: "failed",
        reply,
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
          process_task_id: snapshotBefore.processTask.id,
          process_number: snapshotBefore.processTask.processNumber,
        },
      };
    }

    const driveContext = await getTenantGoogleDriveContext(buildTenantGoogleDriveServiceRequest(), input.tenantId);
    const syncResult = await syncProcessDocuments({
      tenantId: input.tenantId,
      accessToken: driveContext.accessToken,
      task,
    });
    const snapshotAfter = await getLegalCaseContextSnapshot({
      tenantId: input.tenantId,
      entities: { process_task_id: snapshotBefore.processTask.id },
    });
    const refreshReply = buildLegalDocumentMemoryRefreshReply({
      snapshot: snapshotAfter,
      documentCount: syncResult.documents.length,
      warnings: syncResult.warnings,
    });

    await registerLearningEvent(input, "legal_document_memory_refreshed", {
      summary: refreshReply.summary,
      process_task_id: snapshotAfter.processTask.id,
      process_number: snapshotAfter.processTask.processNumber,
      case_brain_task_id: snapshotAfter.caseBrain.taskId,
      document_count: syncResult.documents.length,
      sync_status: snapshotAfter.documentMemory.syncStatus,
      last_synced_at: snapshotAfter.documentMemory.lastSyncedAt,
      missing_documents: snapshotAfter.documentMemory.missingDocuments,
      warning_count: syncResult.warnings.length,
    });
    await registerLegalDocumentMemoryRefreshArtifact(input, {
      snapshot: snapshotAfter,
      reply: refreshReply.reply,
      summary: refreshReply.summary,
      documentCount: syncResult.documents.length,
      warnings: syncResult.warnings,
      resultStatus: "completed",
    });

    return {
      status: "executed",
      reply: refreshReply.reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotAfter.processTask.id,
        process_number: snapshotAfter.processTask.processNumber,
        case_brain_task_id: snapshotAfter.caseBrain.taskId,
        document_count: syncResult.documents.length,
        sync_status: snapshotAfter.documentMemory.syncStatus,
        last_synced_at: snapshotAfter.documentMemory.lastSyncedAt,
        warning_count: syncResult.warnings.length,
        missing_documents: snapshotAfter.documentMemory.missingDocuments,
        drive_folder_id: task.drive_folder_id,
        drive_folder_url: task.drive_link || null,
      },
      data: {
        snapshot: snapshotAfter,
        sync: syncResult,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Nao foi possivel atualizar a memoria documental do processo agora.";
    await registerLegalDocumentMemoryRefreshArtifact(input, {
      snapshot: snapshotBefore,
      reply: errorMessage,
      summary: "A sincronizacao documental falhou antes de atualizar a memoria do processo.",
      documentCount: snapshotBefore.documentMemory.documentCount,
      warnings: [],
      resultStatus: "failed",
      errorMessage,
    });

    return {
      status: "failed",
      reply: errorMessage,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
        process_number: snapshotBefore.processTask.processNumber,
      },
    };
  }
}

type LegalDraftWorkflowAction = "approve" | "publish";

function formatDraftVersionLabel(version: Pick<ProcessDraftVersionRecord, "version_number" | "piece_label">) {
  return `V${version.version_number}${version.piece_label ? ` · ${version.piece_label}` : ""}`;
}

function normalizeLegalDraftWorkflowAction(value: string | null | undefined): LegalDraftWorkflowAction | null {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) return null;
  if (normalized.startsWith("apro") || normalized === "approve") return "approve";
  if (normalized.startsWith("publ") || normalized.startsWith("publi") || normalized === "publish") return "publish";
  return null;
}

function resolveRequestedDraftVersion(versions: ProcessDraftVersionRecord[], entities: Record<string, string>) {
  const versionId = String(entities.version_id || entities.process_draft_version_id || "").trim();
  if (versionId) {
    return versions.find((version) => version.id === versionId) || null;
  }

  const rawVersionNumber = String(entities.version_number || entities.version || "").trim();
  const versionNumber = rawVersionNumber ? Number.parseInt(rawVersionNumber, 10) : NaN;
  if (Number.isFinite(versionNumber) && versionNumber > 0) {
    return versions.find((version) => version.version_number === versionNumber) || null;
  }

  return versions.find((version) => version.is_current) || versions[0] || null;
}

type LegalDraftReviewVerdict = "ready" | "attention" | "critical";
type LegalDraftReviewAction = "approve_after_review" | "publish_ready" | "strengthen_before_approval" | "regenerate_before_review" | "published_reference";
type LegalDraftRevisionPriority = "high" | "medium" | "low";
type LegalDraftRevisionLoopAction = "apply_revision_plan" | "approve_after_loop" | "regenerate_before_revision" | "published_reference";

type LegalDraftReviewResult = {
  reply: string;
  summary: string;
  verdict: LegalDraftReviewVerdict;
  recommendedAction: LegalDraftReviewAction;
  blockers: string[];
  cautions: string[];
  strengths: string[];
  checklist: string[];
};

type LegalDraftSectionAnalysis = {
  title: string;
  normalizedTitle: string;
  content: string;
  charCount: number;
  paragraphCount: number;
  citationCount: number;
  mentionsProof: boolean;
};

type LegalDraftRevisionPlanItem = {
  sectionTitle: string;
  priority: LegalDraftRevisionPriority;
  issue: string;
  recommendation: string;
  reason: string;
  itemType: "weak_section" | "missing_section";
};

type LegalDraftRevisionLoopResult = {
  reply: string;
  summary: string;
  verdict: LegalDraftReviewVerdict;
  recommendedAction: LegalDraftRevisionLoopAction;
  sectionsAnalyzed: number;
  weakSectionCount: number;
  missingSectionCount: number;
  revisionPlan: LegalDraftRevisionPlanItem[];
  strongSections: string[];
  missingSections: string[];
};

async function loadTenantLegalTemplateReviewRecord(params: {
  tenantId: string;
  version: ProcessDraftVersionRecord;
  snapshot: LegalCaseContextSnapshot;
}) {
  const pieceInput = params.version.piece_type || params.version.piece_label || params.snapshot.caseBrain.recommendedPieceInput || "Peticao";
  const pieceRequest = normalizeLegalPieceRequest(pieceInput);
  const { data, error } = await serviceSupabase
    .from("tenant_legal_templates")
    .select("piece_type, template_name, template_mode, structure_markdown, guidance_notes")
    .eq("tenant_id", params.tenantId)
    .eq("is_active", true)
    .in("piece_type", pieceRequest.templateLookupKeys);

  if (error) throw error;

  const fetchedTemplates = (data || []) as TenantLegalTemplateReviewRecord[];
  const selectedTemplate = fetchedTemplates.find((item) => item.piece_type === pieceRequest.normalizedKey)
    || fetchedTemplates.find((item) => item.piece_type === pieceRequest.familyKey)
    || fetchedTemplates[0]
    || null;

  return {
    pieceRequest,
    template: {
      piece_type: pieceRequest.normalizedKey,
      template_name: pieceRequest.defaultTemplate.templateName,
      template_mode: "visual_profile",
      structure_markdown: pieceRequest.defaultTemplate.structureMarkdown,
      guidance_notes: pieceRequest.defaultTemplate.guidanceNotes,
      ...(selectedTemplate || {}),
    } satisfies TenantLegalTemplateReviewRecord,
  };
}

function normalizeDraftSectionKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^#+\s*/, "")
    .replace(/^[IVXLCDM]+\s*[-–.:)]\s*/i, "")
    .replace(/^\d+\s*[-–.:)]\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDraftSectionHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^[IVXLCDM]+\s*[-–.:)]\s+.{3,}/i.test(trimmed)) return true;
  if (/^\d+\s*[-–.:)]\s+.{3,}/.test(trimmed)) return true;
  return false;
}

function cleanDraftSectionHeading(line: string) {
  return String(line || "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ");
}

function countDraftParagraphs(content: string) {
  return String(content || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;
}

function countDraftCitations(content: string) {
  const matches = String(content || "").match(/\b(?:art\.?|arts\.?|lei|tema|sumula|s[uú]mula|resp|re|cpc|cc|clt|cf|stj|stf)\b/gi);
  return matches?.length || 0;
}

function parseTemplateSections(structureMarkdown: string) {
  return String(structureMarkdown || "")
    .split(/\r?\n/)
    .map((line) => cleanDraftSectionHeading(line))
    .filter(Boolean);
}

function parseDraftSections(markdown: string, fallbackTitle: string) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections: LegalDraftSectionAnalysis[] = [];
  let currentTitle = fallbackTitle;
  let currentLines: string[] = [];

  const flushSection = () => {
    const content = currentLines.join("\n").trim();
    if (!content && !currentTitle) return;
    sections.push({
      title: currentTitle || fallbackTitle,
      normalizedTitle: normalizeDraftSectionKey(currentTitle || fallbackTitle),
      content,
      charCount: content.length,
      paragraphCount: countDraftParagraphs(content),
      citationCount: countDraftCitations(content),
      mentionsProof: /(document|prova|laudo|contrato|extrato|anexo|inicial|contestacao|contestação)/i.test(content),
    });
  };

  for (const line of lines) {
    if (isDraftSectionHeading(line)) {
      if (currentLines.length > 0) flushSection();
      currentTitle = cleanDraftSectionHeading(line);
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0 || sections.length === 0) {
    flushSection();
  }

  return sections.filter((section) => section.content.trim().length > 0);
}

function sectionTitleMatches(expectedTitle: string, actualTitle: string) {
  const expected = normalizeDraftSectionKey(expectedTitle);
  const actual = normalizeDraftSectionKey(actualTitle);
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  if (expected.includes(actual) || actual.includes(expected)) return true;

  const expectedTokens = expected.split(/\s+/).filter((token) => token.length > 3);
  const actualTokens = new Set(actual.split(/\s+/).filter((token) => token.length > 3));
  const shared = expectedTokens.filter((token) => actualTokens.has(token));
  return shared.length >= Math.min(2, expectedTokens.length);
}

function rankRevisionPriority(issueCount: number, forceHigh = false): LegalDraftRevisionPriority {
  if (forceHigh || issueCount >= 3) return "high";
  if (issueCount === 2) return "medium";
  return "low";
}

function buildLegalDraftReview(params: {
  snapshot: LegalCaseContextSnapshot;
  version: ProcessDraftVersionRecord;
  template: TenantLegalTemplateReviewRecord;
  pieceRequest: ReturnType<typeof normalizeLegalPieceRequest>;
}): LegalDraftReviewResult {
  const metadata = params.version.metadata || null;
  const storedQualityMetrics = metadata && typeof metadata === "object" && metadata.quality_metrics && typeof metadata.quality_metrics === "object"
    ? metadata.quality_metrics as Record<string, unknown>
    : null;
  const derivedMetrics = parseMarkdownQualityMetrics(params.version.draft_markdown);
  const qualityMetrics = {
    charCount: getMetadataNumber(storedQualityMetrics, "charCount") || derivedMetrics.charCount,
    paragraphCount: getMetadataNumber(storedQualityMetrics, "paragraphCount") || derivedMetrics.paragraphCount,
    sectionCount: getMetadataNumber(storedQualityMetrics, "sectionCount") || derivedMetrics.sectionCount,
  };
  const metadataWarnings = getMetadataStringArray(metadata, "warnings");
  const metadataMissingDocuments = getMetadataStringArray(metadata, "missing_documents");
  const draftIsStale = Boolean(params.snapshot.caseBrain.taskId && params.version.source_case_brain_task_id && params.version.source_case_brain_task_id !== params.snapshot.caseBrain.taskId);
  const blockers: string[] = [];
  const cautions: string[] = [];
  const strengths: string[] = [];
  const checklist: string[] = [];
  const qualityFloor = params.pieceRequest.qualityProfile;

  if (draftIsStale) {
    blockers.push("A versão atual foi gerada com um Case Brain anterior e precisa ser regenerada antes de qualquer aprovação.");
  }

  if (params.snapshot.caseBrain.missingDocuments.length > 0 || metadataMissingDocuments.length > 0) {
    blockers.push(`Ainda existem pendências documentais relevantes: ${[...params.snapshot.caseBrain.missingDocuments, ...metadataMissingDocuments].join("; ")}.`);
  }

  if (qualityMetrics.charCount < qualityFloor.minChars) {
    cautions.push(`A minuta ficou abaixo do piso de profundidade do escritório (${qualityMetrics.charCount}/${qualityFloor.minChars} caracteres).`);
  }

  if (qualityMetrics.paragraphCount < qualityFloor.minParagraphs) {
    cautions.push(`A densidade argumentativa ainda está baixa (${qualityMetrics.paragraphCount}/${qualityFloor.minParagraphs} blocos úteis).`);
  }

  if (qualityMetrics.sectionCount < qualityFloor.minSections) {
    cautions.push(`A estrutura da peça ainda está enxuta demais (${qualityMetrics.sectionCount}/${qualityFloor.minSections} seções esperadas).`);
  }

  if (!params.snapshot.caseBrain.readyForLawCitations) {
    cautions.push("A base normativa ainda não está totalmente validada para citação segura.");
  }

  if (!params.snapshot.caseBrain.readyForCaseLawCitations) {
    cautions.push("A jurisprudência ainda não está totalmente validada para sustentação segura.");
  }

  if (metadataWarnings.length > 0) {
    cautions.push(`A minuta saiu com alertas do motor jurídico: ${metadataWarnings.join("; ")}.`);
  }

  if (params.snapshot.documentMemory.syncStatus === "completed" || params.snapshot.documentMemory.syncStatus === "synced") {
    strengths.push(`O acervo do processo está sincronizado com ${params.snapshot.documentMemory.documentCount} documento(s).`);
  }

  if (params.snapshot.caseBrain.validatedLawReferencesCount > 0 || params.snapshot.caseBrain.validatedCaseLawReferencesCount > 0) {
    strengths.push(`O Case Brain já validou ${params.snapshot.caseBrain.validatedLawReferencesCount} referência(s) normativas e ${params.snapshot.caseBrain.validatedCaseLawReferencesCount} precedente(s).`);
  }

  if (params.version.workflow_status === "approved") {
    strengths.push("A versão já passou por aprovação formal e pode ser tratada como candidata imediata à publicação.");
  }

  if (params.version.workflow_status === "published") {
    strengths.push("Esta é a versão publicada vigente da minuta jurídica.");
  }

  checklist.push(`Conferir se a estrutura essencial está coberta: ${params.template.structure_markdown || params.pieceRequest.defaultTemplate.structureMarkdown}.`);
  checklist.push(`Validar se o texto respeita o padrão do escritório: ${params.template.guidance_notes || params.pieceRequest.defaultTemplate.guidanceNotes}`);
  checklist.push("Confirmar coerência entre fatos, prova documental e pedidos finais antes de qualquer decisão formal.");
  if (params.snapshot.firstDraft.requiresHumanReview) {
    checklist.push("Registrar revisão humana final do advogado responsável antes de aprovar ou publicar.");
  }

  const verdict: LegalDraftReviewVerdict = blockers.length > 0
    ? "critical"
    : cautions.length > 0
      ? "attention"
      : "ready";

  const recommendedAction: LegalDraftReviewAction = verdict === "critical"
    ? "regenerate_before_review"
    : params.version.workflow_status === "published"
      ? "published_reference"
      : params.version.workflow_status === "approved"
        ? "publish_ready"
        : verdict === "ready"
          ? "approve_after_review"
          : "strengthen_before_approval";

  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const versionLabel = formatDraftVersionLabel(params.version);
  const verdictLabel = verdict === "critical"
    ? "precisa de correção antes do workflow formal"
    : verdict === "attention"
      ? "está utilizável, mas ainda pede reforço jurídico"
      : "está madura para a próxima decisão formal";
  const recommendedActionLabel = recommendedAction === "regenerate_before_review"
    ? "Regenerar a minuta com o contexto atual do Case Brain."
    : recommendedAction === "publish_ready"
      ? "Publicar a versão após conferência final de gabinete."
      : recommendedAction === "published_reference"
        ? "Usar esta versão como referência oficial já publicada."
        : recommendedAction === "strengthen_before_approval"
          ? "Fortalecer a minuta antes de aprovar formalmente."
          : "Aprovar a versão após a revisão humana final.";
  const summary = `Revisão da ${versionLabel} de ${processLabel}: a minuta ${verdictLabel}`;
  const reply = [
    "## Revisão orientada da minuta",
    `- Processo: ${processLabel}`,
    `- Versão analisada: ${versionLabel}`,
    `- Status formal: ${params.version.workflow_status}`,
    `- Veredito MAYA: ${verdictLabel}`,
    `- Próximo passo sugerido: ${recommendedActionLabel}`,
    "",
    "## Pontos fortes",
    ...(strengths.length > 0 ? strengths.map((item) => `- ${item}`) : ["- Ainda não há força suficiente registrada para liberar a versão sem ressalvas."]),
    "",
    "## Pontos de atenção",
    ...(blockers.length > 0 || cautions.length > 0
      ? [...blockers, ...cautions].map((item) => `- ${item}`)
      : ["- Não encontrei bloqueios críticos nem alertas relevantes para esta versão."]),
    "",
    "## Checklist de revisão",
    ...checklist.map((item) => `- ${item}`),
  ].join("\n");

  return {
    reply,
    summary,
    verdict,
    recommendedAction,
    blockers,
    cautions,
    strengths,
    checklist,
  };
}

function buildLegalDraftRevisionLoop(params: {
  snapshot: LegalCaseContextSnapshot;
  version: ProcessDraftVersionRecord;
  template: TenantLegalTemplateReviewRecord;
  pieceRequest: ReturnType<typeof normalizeLegalPieceRequest>;
  baseReview: LegalDraftReviewResult;
}): LegalDraftRevisionLoopResult {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const versionLabel = formatDraftVersionLabel(params.version);
  const fallbackTitle = params.pieceRequest.pieceLabel || params.snapshot.caseBrain.recommendedPieceLabel || "Texto principal";
  const expectedSections = parseTemplateSections(params.template.structure_markdown || params.pieceRequest.defaultTemplate.structureMarkdown);
  const actualSections = parseDraftSections(params.version.draft_markdown, fallbackTitle);
  const targetCharsPerSection = Math.max(650, Math.floor(params.pieceRequest.qualityProfile.minChars / Math.max(expectedSections.length, 3)));
  const targetParagraphsPerSection = Math.max(2, Math.floor(params.pieceRequest.qualityProfile.minParagraphs / Math.max(expectedSections.length, 3)));
  const revisionPlan: LegalDraftRevisionPlanItem[] = [];
  const strongSections: string[] = [];

  const missingSections = expectedSections.filter((expectedTitle) => {
    return !actualSections.some((section) => sectionTitleMatches(expectedTitle, section.title));
  });

  for (const missingTitle of missingSections) {
    revisionPlan.push({
      sectionTitle: missingTitle,
      priority: /pedido|merito|mérito|sintese|s[ií]ntese|impugnacao|impugna[cç][aã]o/i.test(missingTitle) ? "high" : "medium",
      issue: "Bloco estrutural previsto no template ainda nao apareceu na versao atual.",
      recommendation: `Criar o bloco \"${missingTitle}\" e desenvolver este eixo com base no guidance do escritorio e no acervo validado.`,
      reason: "missing_section",
      itemType: "missing_section",
    });
  }

  for (const section of actualSections) {
    const issues: string[] = [];
    const recommendations: string[] = [];
    const sectionKey = section.normalizedTitle;

    if (section.charCount < targetCharsPerSection * 0.65) {
      issues.push(`o bloco ficou curto demais para sustentar o padrao do escritorio (${section.charCount}/${targetCharsPerSection} caracteres de referencia)`);
      recommendations.push("Expandir a argumentacao com fatos, prova e amarracao juridica mais explicita.");
    }

    if (section.paragraphCount < Math.max(2, Math.floor(targetParagraphsPerSection * 0.7)) && section.charCount < targetCharsPerSection * 0.85) {
      issues.push(`a densidade argumentativa ainda esta baixa (${section.paragraphCount}/${targetParagraphsPerSection} paragrafos de referencia)`);
      recommendations.push("Quebrar o raciocinio em paragrafos curtos com tese, fundamento e efeito pratico.");
    }

    if (/(merito|mérito|direito|preliminar|impugnacao|impugnacao especifica|fundamento)/i.test(sectionKey) && section.citationCount === 0 && (params.snapshot.caseBrain.readyForLawCitations || params.snapshot.caseBrain.readyForCaseLawCitations)) {
      issues.push("faltam ancoragens normativas ou jurisprudenciais neste eixo central da defesa");
      recommendations.push("Inserir referencias legais e precedentes ja validados pelo Case Brain dentro desta secao.");
    }

    if (/(sintese|sintese da inicial|fatos|historico|contexto|inicial)/i.test(sectionKey) && !section.mentionsProof && params.snapshot.documentMemory.documentCount > 0) {
      issues.push("a narrativa fática ainda nao conversa de forma suficiente com a prova documental do processo");
      recommendations.push("Amarrar os fatos aos documentos mais fortes do acervo do cliente e ao ataque da inicial.");
    }

    if (/(pedido|pedidos|requerimento|requerimentos)/i.test(sectionKey) && !/(requer|pedido|pedidos|improcedencia|procedencia|provimento)/i.test(section.content)) {
      issues.push("o fechamento da secao nao apresenta pedidos ou requerimentos com a clareza esperada");
      recommendations.push("Reescrever o fechamento com pedidos defensivos claros, objetivos e executaveis.");
    }

    if (issues.length === 0) {
      strongSections.push(section.title);
      continue;
    }

    revisionPlan.push({
      sectionTitle: section.title,
      priority: rankRevisionPriority(issues.length),
      issue: issues.join("; "),
      recommendation: Array.from(new Set(recommendations)).join(" "),
      reason: sectionKey,
      itemType: "weak_section",
    });
  }

  const prioritizedPlan = revisionPlan
    .sort((left, right) => {
      const weight = { high: 3, medium: 2, low: 1 } satisfies Record<LegalDraftRevisionPriority, number>;
      return weight[right.priority] - weight[left.priority];
    })
    .slice(0, 6);

  const recommendedAction: LegalDraftRevisionLoopAction = params.baseReview.verdict === "critical"
    ? "regenerate_before_revision"
    : params.version.workflow_status === "published"
      ? "published_reference"
      : prioritizedPlan.length > 0
        ? "apply_revision_plan"
        : "approve_after_loop";
  const recommendedActionLabel = recommendedAction === "regenerate_before_revision"
    ? "Regenerar a minuta antes de iniciar qualquer ciclo de melhoria por seção."
    : recommendedAction === "published_reference"
      ? "Tratar a versao publicada como referencia e aplicar reforcos apenas em nova versao supervisionada."
      : recommendedAction === "approve_after_loop"
        ? "A minuta ja esta robusta; siga para a revisao humana final e aprovacao formal."
        : "Aplicar o plano de reforco por seção antes de aprovar a versao atual.";
  const weakSectionCount = prioritizedPlan.filter((item) => item.itemType === "weak_section").length;
  const summary = `Loop de revisao da ${versionLabel} de ${processLabel}: ${prioritizedPlan.length > 0 ? `${weakSectionCount} secao(oes) fracas e ${missingSections.length} lacuna(s) estruturais mapeadas.` : "nenhuma secao critica adicional identificada."}`;
  const reply = [
    "## Loop supervisionado da minuta",
    `- Processo: ${processLabel}`,
    `- Versao analisada: ${versionLabel}`,
    `- Secoes analisadas: ${actualSections.length}`,
    `- Secoes fracas: ${weakSectionCount}`,
    `- Lacunas estruturais: ${missingSections.length}`,
    `- Veredito MAYA: ${params.baseReview.verdict}`,
    `- Proximo passo sugerido: ${recommendedActionLabel}`,
    "",
    "## Plano de reforco por secao",
    ...(prioritizedPlan.length > 0
      ? prioritizedPlan.flatMap((item, index) => [
          `${index + 1}. ${item.sectionTitle} [${item.priority}]`,
          `Problema: ${item.issue}`,
          `Reforco sugerido: ${item.recommendation}`,
        ])
      : ["1. Nenhum bloco adicional exige loop de reforco nesta versao. Faça apenas a revisão humana final."]),
    "",
    "## Secoes consistentes",
    ...(strongSections.length > 0
      ? strongSections.slice(0, 4).map((item) => `- ${item}`)
      : ["- Nenhum bloco ficou forte o suficiente para ser destacado sem ressalvas."]),
    "",
    "## Guardrails do loop",
    `- ${params.baseReview.checklist[0] || "Manter aderencia ao template do escritorio."}`,
    `- ${params.baseReview.checklist[params.baseReview.checklist.length - 1] || "Concluir com revisao humana obrigatoria."}`,
    "- Este pacote prepara o plano supervisionado; ainda nao materializa automaticamente uma nova Vn+1.",
  ].join("\n");

  return {
    reply,
    summary,
    verdict: params.baseReview.verdict,
    recommendedAction,
    sectionsAnalyzed: actualSections.length,
    weakSectionCount,
    missingSectionCount: missingSections.length,
    revisionPlan: prioritizedPlan,
    strongSections,
    missingSections,
  };
}

async function registerLegalDraftRevisionLoopArtifact(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    version: ProcessDraftVersionRecord | null;
    reply: string;
    summary: string;
    verdict?: LegalDraftReviewVerdict | null;
    recommendedAction?: LegalDraftRevisionLoopAction | null;
    sectionsAnalyzed?: number;
    weakSectionCount?: number;
    missingSectionCount?: number;
    revisionPlan?: LegalDraftRevisionPlanItem[];
    strongSections?: string[];
    missingSections?: string[];
    resultStatus: "missing_version" | "completed" | "failed";
    errorMessage?: string | null;
  }
) {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const promotionCandidate = getMetadataRecord(params.version?.metadata || null, "promotion_candidate");

  await registerArtifact(input, {
    artifactType: "legal_draft_revision_loop",
    title: `Loop da minuta - ${params.snapshot.processTask.clientName || params.snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `legal-draft-revision-loop:${input.auditLogId}`
      : `legal-draft-revision-loop:${params.snapshot.processTask.id}:${params.version?.id || params.resultStatus}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.resultStatus,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: params.snapshot.processTask.clientName,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      case_id: params.snapshot.caseBrain.caseId,
      draft_version_id: params.version?.id || null,
      draft_version_number: params.version?.version_number || null,
      draft_workflow_status: params.version?.workflow_status || null,
      piece_label: params.version?.piece_label || params.snapshot.firstDraft.pieceLabel || params.snapshot.caseBrain.recommendedPieceLabel,
      review_verdict: params.verdict || null,
      recommended_action: params.recommendedAction || null,
      sections_analyzed: params.sectionsAnalyzed || 0,
      weak_section_count: params.weakSectionCount || 0,
      missing_section_count: params.missingSectionCount || 0,
      revision_plan: params.revisionPlan || [],
      strong_sections: params.strongSections || [],
      missing_sections: params.missingSections || [],
      error_message: params.errorMessage || null,
    },
  });
}

async function runLegalDraftRevisionLoop(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshot = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;

  try {
    const versions = await listProcessDraftVersions({
      tenantId: input.tenantId,
      processTaskId: snapshot.processTask.id,
    });
    const version = resolveRequestedDraftVersion(versions, input.entities);

    if (!version) {
      const reply = `O processo ${processLabel} ainda nao tem uma versao formal de minuta registrada para iniciar o loop supervisionado de revisao.`;
      await registerLearningEvent(input, "legal_draft_revision_loop_prepared", {
        summary: reply,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        result_status: "missing_version",
      });
      await registerLegalDraftRevisionLoopArtifact(input, {
        snapshot,
        version: null,
        reply,
        summary: reply,
        resultStatus: "missing_version",
        errorMessage: reply,
      });

      return {
        status: "failed",
        reply,
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
          process_task_id: snapshot.processTask.id,
        },
      };
    }

    const { pieceRequest, template } = await loadTenantLegalTemplateReviewRecord({
      tenantId: input.tenantId,
      version,
      snapshot,
    });
    const baseReview = buildLegalDraftReview({
      snapshot,
      version,
      template,
      pieceRequest,
    });
    const revisionLoop = buildLegalDraftRevisionLoop({
      snapshot,
      version,
      template,
      pieceRequest,
      baseReview,
    });

    await registerLearningEvent(input, "legal_draft_revision_loop_prepared", {
      summary: revisionLoop.summary,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      draft_version_id: version.id,
      draft_version_number: version.version_number,
      workflow_status: version.workflow_status,
      review_verdict: revisionLoop.verdict,
      recommended_action: revisionLoop.recommendedAction,
      sections_analyzed: revisionLoop.sectionsAnalyzed,
      weak_section_count: revisionLoop.weakSectionCount,
      missing_section_count: revisionLoop.missingSectionCount,
      piece_label: version.piece_label,
    });
    await registerLegalDraftRevisionLoopArtifact(input, {
      snapshot,
      version,
      reply: revisionLoop.reply,
      summary: revisionLoop.summary,
      verdict: revisionLoop.verdict,
      recommendedAction: revisionLoop.recommendedAction,
      sectionsAnalyzed: revisionLoop.sectionsAnalyzed,
      weakSectionCount: revisionLoop.weakSectionCount,
      missingSectionCount: revisionLoop.missingSectionCount,
      revisionPlan: revisionLoop.revisionPlan,
      strongSections: revisionLoop.strongSections,
      missingSections: revisionLoop.missingSections,
      resultStatus: "completed",
    });

    return {
      status: "executed",
      reply: revisionLoop.reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
        case_brain_task_id: snapshot.caseBrain.taskId,
        draft_version_id: version.id,
        draft_version_number: version.version_number,
        draft_workflow_status: version.workflow_status,
        review_verdict: revisionLoop.verdict,
        recommended_action: revisionLoop.recommendedAction,
        sections_analyzed: revisionLoop.sectionsAnalyzed,
        weak_section_count: revisionLoop.weakSectionCount,
        missing_section_count: revisionLoop.missingSectionCount,
        piece_label: version.piece_label,
      },
      data: {
        snapshot,
        version,
        revisionLoop,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Nao foi possivel montar o loop supervisionado de revisao da minuta agora.";
    await registerLearningEvent(input, "legal_draft_revision_loop_prepared", {
      summary: errorMessage,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      result_status: "failed",
    });
    await registerLegalDraftRevisionLoopArtifact(input, {
      snapshot,
      version: null,
      reply: errorMessage,
      summary: "O loop supervisionado da minuta falhou no MAYUS.",
      resultStatus: "failed",
      errorMessage,
    });

    return {
      status: "failed",
      reply: errorMessage,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
      },
    };
  }
}

async function registerLegalArtifactPublishPremiumArtifact(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    version: ProcessDraftVersionRecord | null;
    reply: string;
    summary: string;
    resultStatus: "missing_version" | "not_published" | "completed" | "failed";
    publication?: {
      format: string;
      fileName: string;
      driveFileId: string;
      webViewLink: string | null;
      driveFolderLabel: string;
      publishedAt: string;
    } | null;
    learningLoopCapture?: {
      changed: boolean;
      sourceKind: string;
      sourceLabel: string | null;
      changeRatio: number;
      categories: string[];
      summary: string;
      baseline: Record<string, unknown>;
      final: Record<string, unknown>;
      delta: Record<string, unknown>;
    } | null;
    errorMessage?: string | null;
  }
) {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  const promotionCandidate = getMetadataRecord(params.version?.metadata || null, "promotion_candidate");

  await registerArtifact(input, {
    artifactType: "legal_artifact_publish_premium",
    title: `Artifact premium - ${params.snapshot.processTask.clientName || params.snapshot.processTask.title}`,
    mimeType: "application/json",
    storageUrl: params.publication?.webViewLink || null,
    dedupeKey: input.auditLogId
      ? `legal-artifact-publish-premium:${input.auditLogId}`
      : `legal-artifact-publish-premium:${params.snapshot.processTask.id}:${params.version?.id || params.resultStatus}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.resultStatus,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: params.snapshot.processTask.clientName,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      draft_version_id: params.version?.id || null,
      draft_version_number: params.version?.version_number || null,
      draft_workflow_status: params.version?.workflow_status || null,
      piece_label: params.version?.piece_label || params.snapshot.firstDraft.pieceLabel || params.snapshot.caseBrain.recommendedPieceLabel,
      publish_format: params.publication?.format || null,
      publish_status: params.publication ? "published" : params.resultStatus,
      drive_file_id: params.publication?.driveFileId || null,
      drive_file_name: params.publication?.fileName || null,
      drive_folder_label: params.publication?.driveFolderLabel || null,
      drive_file_url: params.publication?.webViewLink || null,
      published_at: params.publication?.publishedAt || null,
      learning_loop_changed: params.learningLoopCapture?.changed ?? null,
      learning_loop_source_kind: params.learningLoopCapture?.sourceKind || null,
      learning_loop_source_label: params.learningLoopCapture?.sourceLabel || null,
      learning_loop_change_ratio: params.learningLoopCapture?.changeRatio ?? null,
      learning_loop_categories: params.learningLoopCapture?.categories || [],
      learning_loop_summary: params.learningLoopCapture?.summary || null,
      learning_loop_capture: params.learningLoopCapture || null,
      promotion_candidate_status: getStringValue(promotionCandidate?.status) || null,
      promotion_candidate_confidence: getStringValue(promotionCandidate?.confidence) || null,
      promotion_candidate_types: getMetadataStringArray(promotionCandidate, "candidateTypes"),
      promotion_candidate_summary: getStringValue(promotionCandidate?.summary) || null,
      promotion_candidate: promotionCandidate || null,
      error_message: params.errorMessage || null,
    },
  });
}

async function runLegalArtifactPublishPremium(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshot = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;

  try {
    const versions = await listProcessDraftVersions({
      tenantId: input.tenantId,
      processTaskId: snapshot.processTask.id,
    });
    const version = resolveRequestedDraftVersion(versions, input.entities);

    if (!version) {
      const reply = `O processo ${processLabel} ainda nao tem uma versao formal pronta para publicar o artifact premium.`;
      await registerLearningEvent(input, "legal_artifact_publish_premium_executed", {
        summary: reply,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        result_status: "missing_version",
      });
      await registerLegalArtifactPublishPremiumArtifact(input, {
        snapshot,
        version: null,
        reply,
        summary: reply,
        resultStatus: "missing_version",
        errorMessage: reply,
      });

      return {
        status: "failed",
        reply,
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
          process_task_id: snapshot.processTask.id,
        },
      };
    }

    if (version.workflow_status !== "published") {
      const reply = `A versao ${formatDraftVersionLabel(version)} de ${processLabel} ainda nao foi publicada formalmente. Publique a versao juridica antes de enviar o artifact premium ao Drive.`;
      await registerLearningEvent(input, "legal_artifact_publish_premium_executed", {
        summary: reply,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        draft_version_id: version.id,
        draft_version_number: version.version_number,
        result_status: "not_published",
      });
      await registerLegalArtifactPublishPremiumArtifact(input, {
        snapshot,
        version,
        reply,
        summary: reply,
        resultStatus: "not_published",
        errorMessage: reply,
      });

      return {
        status: "failed",
        reply,
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
          process_task_id: snapshot.processTask.id,
          draft_version_id: version.id,
          draft_version_number: version.version_number,
          draft_workflow_status: version.workflow_status,
        },
      };
    }

    const driveContext = await getTenantGoogleDriveContext(buildTenantGoogleDriveServiceRequest(), input.tenantId);
    const published = await publishLegalPiecePremium({
      tenantId: input.tenantId,
      taskId: snapshot.processTask.id,
      accessToken: driveContext.accessToken,
      pieceType: version.piece_type || "peca_juridica",
      pieceLabel: version.piece_label || snapshot.caseBrain.recommendedPieceLabel || "Peça Jurídica",
      draftMarkdown: version.draft_markdown,
      versionId: version.id,
    });
    const summary = `O artifact premium em PDF da ${formatDraftVersionLabel(version)} de ${processLabel} foi publicado em ${published.publication.driveFolderLabel}.`;
    const learningLoopSummary = published.learningLoopCapture?.summary || null;
    const reply = [
      summary,
      `Arquivo: ${published.publication.fileName}`,
      published.publication.webViewLink ? `Link: ${published.publication.webViewLink}` : null,
      learningLoopSummary ? `Learning loop: ${learningLoopSummary}` : null,
    ].filter(Boolean).join("\n\n");

    await registerLearningEvent(input, "legal_artifact_publish_premium_executed", {
      summary,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      draft_version_id: version.id,
      draft_version_number: version.version_number,
      workflow_status: version.workflow_status,
      publish_format: published.publication.format,
      drive_file_id: published.publication.driveFileId,
      drive_folder_label: published.publication.driveFolderLabel,
      piece_label: version.piece_label,
      learning_loop_changed: published.learningLoopCapture?.changed ?? null,
      learning_loop_source_kind: published.learningLoopCapture?.sourceKind || null,
      learning_loop_source_label: published.learningLoopCapture?.sourceLabel || null,
      learning_loop_change_ratio: published.learningLoopCapture?.changeRatio ?? null,
      learning_loop_categories: published.learningLoopCapture?.categories || [],
      learning_loop_summary: published.learningLoopCapture?.summary || null,
      promotion_candidate_status: getStringValue(getMetadataRecord(version.metadata || null, "promotion_candidate")?.status) || null,
      promotion_candidate_types: getMetadataStringArray(getMetadataRecord(version.metadata || null, "promotion_candidate"), "candidateTypes"),
      promotion_candidate_summary: getStringValue(getMetadataRecord(version.metadata || null, "promotion_candidate")?.summary) || null,
    });
    await registerLegalArtifactPublishPremiumArtifact(input, {
      snapshot,
      version,
      reply,
      summary,
      resultStatus: "completed",
      publication: published.publication,
      learningLoopCapture: published.learningLoopCapture,
    });

    return {
      status: "executed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
        case_brain_task_id: snapshot.caseBrain.taskId,
        draft_version_id: version.id,
        draft_version_number: version.version_number,
        draft_workflow_status: version.workflow_status,
        publish_format: published.publication.format,
        drive_file_id: published.publication.driveFileId,
        drive_file_name: published.publication.fileName,
        drive_file_url: published.publication.webViewLink,
        drive_folder_label: published.publication.driveFolderLabel,
        piece_label: version.piece_label,
        learning_loop_changed: published.learningLoopCapture?.changed ?? null,
        learning_loop_source_kind: published.learningLoopCapture?.sourceKind || null,
        learning_loop_source_label: published.learningLoopCapture?.sourceLabel || null,
        learning_loop_change_ratio: published.learningLoopCapture?.changeRatio ?? null,
        learning_loop_categories: published.learningLoopCapture?.categories || [],
        learning_loop_summary: published.learningLoopCapture?.summary || null,
      },
      data: {
        snapshot,
        version,
        publication: published.publication,
        learningLoopCapture: published.learningLoopCapture,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Nao foi possivel publicar o artifact premium da minuta agora.";
    await registerLearningEvent(input, "legal_artifact_publish_premium_executed", {
      summary: errorMessage,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      result_status: "failed",
    });
    await registerLegalArtifactPublishPremiumArtifact(input, {
      snapshot,
      version: null,
      reply: errorMessage,
      summary: "A publicacao premium do artifact juridico falhou no MAYUS.",
      resultStatus: "failed",
      errorMessage,
    });

    return {
      status: "failed",
      reply: errorMessage,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
      },
    };
  }
}

async function registerLegalDraftReviewArtifact(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    version: ProcessDraftVersionRecord | null;
    reply: string;
    summary: string;
    verdict?: LegalDraftReviewVerdict | null;
    recommendedAction?: LegalDraftReviewAction | null;
    blockers?: string[];
    cautions?: string[];
    strengths?: string[];
    checklist?: string[];
    resultStatus: "missing_version" | "completed" | "failed";
    errorMessage?: string | null;
  }
) {
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;

  await registerArtifact(input, {
    artifactType: "legal_draft_review",
    title: `Revisao da minuta - ${params.snapshot.processTask.clientName || params.snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `legal-draft-review:${input.auditLogId}`
      : `legal-draft-review:${params.snapshot.processTask.id}:${params.version?.id || params.resultStatus}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.resultStatus,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: params.snapshot.processTask.clientName,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      case_id: params.snapshot.caseBrain.caseId,
      draft_version_id: params.version?.id || null,
      draft_version_number: params.version?.version_number || null,
      draft_workflow_status: params.version?.workflow_status || null,
      piece_label: params.version?.piece_label || params.snapshot.firstDraft.pieceLabel || params.snapshot.caseBrain.recommendedPieceLabel,
      review_verdict: params.verdict || null,
      recommended_action: params.recommendedAction || null,
      blocker_count: params.blockers?.length || 0,
      caution_count: params.cautions?.length || 0,
      blockers: params.blockers || [],
      cautions: params.cautions || [],
      strengths: params.strengths || [],
      checklist: params.checklist || [],
      error_message: params.errorMessage || null,
    },
  });
}

async function runLegalDraftReviewGuidance(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshot = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;

  try {
    const versions = await listProcessDraftVersions({
      tenantId: input.tenantId,
      processTaskId: snapshot.processTask.id,
    });
    const version = resolveRequestedDraftVersion(versions, input.entities);

    if (!version) {
      const reply = `O processo ${processLabel} ainda nao tem uma versao formal de minuta registrada para revisao orientada no MAYUS.`;
      await registerLearningEvent(input, "legal_draft_review_prepared", {
        summary: reply,
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        result_status: "missing_version",
      });
      await registerLegalDraftReviewArtifact(input, {
        snapshot,
        version: null,
        reply,
        summary: reply,
        resultStatus: "missing_version",
        errorMessage: reply,
      });

      return {
        status: "failed",
        reply,
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
          process_task_id: snapshot.processTask.id,
        },
      };
    }

    const { pieceRequest, template } = await loadTenantLegalTemplateReviewRecord({
      tenantId: input.tenantId,
      version,
      snapshot,
    });
    const review = buildLegalDraftReview({
      snapshot,
      version,
      template,
      pieceRequest,
    });

    await registerLearningEvent(input, "legal_draft_review_prepared", {
      summary: review.summary,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      draft_version_id: version.id,
      draft_version_number: version.version_number,
      workflow_status: version.workflow_status,
      review_verdict: review.verdict,
      recommended_action: review.recommendedAction,
      blocker_count: review.blockers.length,
      caution_count: review.cautions.length,
      piece_label: version.piece_label,
    });
    await registerLegalDraftReviewArtifact(input, {
      snapshot,
      version,
      reply: review.reply,
      summary: review.summary,
      verdict: review.verdict,
      recommendedAction: review.recommendedAction,
      blockers: review.blockers,
      cautions: review.cautions,
      strengths: review.strengths,
      checklist: review.checklist,
      resultStatus: "completed",
    });

    return {
      status: "executed",
      reply: review.reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
        case_brain_task_id: snapshot.caseBrain.taskId,
        draft_version_id: version.id,
        draft_version_number: version.version_number,
        draft_workflow_status: version.workflow_status,
        review_verdict: review.verdict,
        recommended_action: review.recommendedAction,
        piece_label: version.piece_label,
      },
      data: {
        snapshot,
        version,
        review,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Nao foi possivel revisar a minuta juridica agora.";
    await registerLearningEvent(input, "legal_draft_review_prepared", {
      summary: errorMessage,
      process_task_id: snapshot.processTask.id,
      process_number: snapshot.processTask.processNumber,
      result_status: "failed",
    });
    await registerLegalDraftReviewArtifact(input, {
      snapshot,
      version: null,
      reply: errorMessage,
      summary: "A revisao juridica da minuta falhou no MAYUS.",
      resultStatus: "failed",
      errorMessage,
    });

    return {
      status: "failed",
      reply: errorMessage,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshot.processTask.id,
      },
    };
  }
}

async function registerLegalDraftWorkflowResultArtifact(
  input: DispatchCapabilityInput,
  params: {
    snapshot: LegalCaseContextSnapshot;
    reply: string;
    summary: string;
    requestedAction: LegalDraftWorkflowAction | null;
    resultStatus: "missing_action" | "missing_version" | "completed" | "already_applied" | "failed";
    versionBefore?: ProcessDraftVersionRecord | null;
    versionAfter?: ProcessDraftVersionRecord | null;
    actionsExecuted?: LegalDraftWorkflowAction[];
    errorMessage?: string | null;
  }
) {
  const effectiveVersion = params.versionAfter || params.versionBefore || null;
  const processLabel = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;

  await registerArtifact(input, {
    artifactType: "legal_draft_workflow_result",
    title: `Workflow formal - ${params.snapshot.processTask.clientName || params.snapshot.processTask.title}`,
    mimeType: "application/json",
    dedupeKey: input.auditLogId
      ? `legal-draft-workflow:${input.auditLogId}`
      : `legal-draft-workflow:${params.snapshot.processTask.id}:${params.requestedAction || "sem-acao"}:${effectiveVersion?.id || params.resultStatus}`,
    metadata: {
      reply: params.reply,
      summary: params.summary,
      result_status: params.resultStatus,
      process_task_id: params.snapshot.processTask.id,
      process_number: params.snapshot.processTask.processNumber,
      process_label: processLabel,
      client_name: params.snapshot.processTask.clientName,
      case_brain_task_id: params.snapshot.caseBrain.taskId,
      case_id: params.snapshot.caseBrain.caseId,
      requested_action: params.requestedAction,
      workflow_action_requested: params.requestedAction,
      workflow_actions_executed: params.actionsExecuted || [],
      draft_version_id: effectiveVersion?.id || null,
      draft_version_number: effectiveVersion?.version_number || null,
      draft_workflow_status: effectiveVersion?.workflow_status || null,
      draft_workflow_status_before: params.versionBefore?.workflow_status || null,
      draft_workflow_status_after: params.versionAfter?.workflow_status || params.versionBefore?.workflow_status || null,
      piece_label: effectiveVersion?.piece_label || params.snapshot.firstDraft.pieceLabel || params.snapshot.caseBrain.recommendedPieceLabel,
      first_draft_status: params.snapshot.firstDraft.status,
      first_draft_stale: params.snapshot.firstDraft.isStale,
      error_message: params.errorMessage || null,
    },
  });
}

async function runLegalDraftWorkflow(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshotBefore = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });
  const processLabel = snapshotBefore.processTask.processNumber || snapshotBefore.processTask.title;
  const requestedAction = normalizeLegalDraftWorkflowAction(input.entities.workflow_action || input.entities.action);

  if (!requestedAction) {
    const reply = `Nao consegui identificar se voce quer aprovar ou publicar a minuta de ${processLabel}.`;
    await registerLegalDraftWorkflowResultArtifact(input, {
      snapshot: snapshotBefore,
      reply,
      summary: "O MAYUS nao conseguiu identificar a acao formal desejada para a minuta.",
      requestedAction: null,
      resultStatus: "missing_action",
      errorMessage: reply,
    });

    return {
      status: "failed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
      },
    };
  }

  const versionsBefore = await listProcessDraftVersions({
    tenantId: input.tenantId,
    processTaskId: snapshotBefore.processTask.id,
  });
  const versionBefore = resolveRequestedDraftVersion(versionsBefore, input.entities);

  if (!versionBefore) {
    const reply = `O processo ${processLabel} ainda nao tem uma versao formal de minuta pronta para ${requestedAction === "approve" ? "aprovacao" : "publicacao"}.`;
    await registerLegalDraftWorkflowResultArtifact(input, {
      snapshot: snapshotBefore,
      reply,
      summary: "Nao existe versao formal de minuta disponivel para o workflow solicitado.",
      requestedAction,
      resultStatus: "missing_version",
      errorMessage: reply,
    });

    return {
      status: "failed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
        workflow_action_requested: requestedAction,
      },
    };
  }

  const versionLabel = formatDraftVersionLabel(versionBefore);
  const alreadyAppliedReply = requestedAction === "approve"
    ? versionBefore.workflow_status === "approved"
      ? `A versao ${versionLabel} de ${processLabel} ja estava aprovada formalmente.`
      : versionBefore.workflow_status === "published"
        ? `A versao ${versionLabel} de ${processLabel} ja estava publicada; nenhuma nova aprovacao foi necessaria.`
        : null
    : versionBefore.workflow_status === "published"
      ? `A versao ${versionLabel} de ${processLabel} ja estava publicada formalmente.`
      : null;

  if (alreadyAppliedReply) {
    await registerLearningEvent(input, "legal_draft_workflow_executed", {
      summary: alreadyAppliedReply,
      process_task_id: snapshotBefore.processTask.id,
      process_number: snapshotBefore.processTask.processNumber,
      draft_version_id: versionBefore.id,
      draft_version_number: versionBefore.version_number,
      workflow_action_requested: requestedAction,
      workflow_actions_executed: [],
      workflow_status: versionBefore.workflow_status,
      piece_label: versionBefore.piece_label,
    });

    await registerLegalDraftWorkflowResultArtifact(input, {
      snapshot: snapshotBefore,
      reply: alreadyAppliedReply,
      summary: alreadyAppliedReply,
      requestedAction,
      resultStatus: "already_applied",
      versionBefore,
      actionsExecuted: [],
    });

    return {
      status: "executed",
      reply: alreadyAppliedReply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
        draft_version_id: versionBefore.id,
        draft_version_number: versionBefore.version_number,
        draft_workflow_status: versionBefore.workflow_status,
        workflow_action_requested: requestedAction,
        workflow_actions_executed: [],
      },
      data: {
        snapshot: snapshotBefore,
        version: versionBefore,
      },
    };
  }

  try {
    const actionsExecuted: LegalDraftWorkflowAction[] = [];
    let versionAfter = versionBefore;

    if (requestedAction === "publish" && versionAfter.workflow_status === "draft") {
      versionAfter = await updateProcessDraftVersionWorkflow({
        tenantId: input.tenantId,
        processTaskId: snapshotBefore.processTask.id,
        versionId: versionAfter.id,
        action: "approve",
        actorId: input.userId || "system",
      });
      actionsExecuted.push("approve");
    }

    versionAfter = await updateProcessDraftVersionWorkflow({
      tenantId: input.tenantId,
      processTaskId: snapshotBefore.processTask.id,
      versionId: versionAfter.id,
      action: requestedAction,
      actorId: input.userId || "system",
    });
    actionsExecuted.push(requestedAction);

    const snapshotAfter = await getLegalCaseContextSnapshot({
      tenantId: input.tenantId,
      entities: { process_task_id: snapshotBefore.processTask.id },
    });
    const summary = actionsExecuted.length === 2
      ? `A versao ${versionLabel} de ${processLabel} foi aprovada e publicada com sucesso.`
      : requestedAction === "approve"
        ? `A versao ${versionLabel} de ${processLabel} foi aprovada com sucesso.`
        : `A versao ${versionLabel} de ${processLabel} foi publicada com sucesso.`;
    let reply = summary;

    if (versionAfter.summary && versionAfter.summary !== versionBefore.summary) {
      reply += `\n\n${versionAfter.summary}`;
    }

    await registerLearningEvent(input, "legal_draft_workflow_executed", {
      summary,
      process_task_id: snapshotAfter.processTask.id,
      process_number: snapshotAfter.processTask.processNumber,
      case_brain_task_id: snapshotAfter.caseBrain.taskId,
      draft_version_id: versionAfter.id,
      draft_version_number: versionAfter.version_number,
      workflow_action_requested: requestedAction,
      workflow_actions_executed: actionsExecuted,
      workflow_status: versionAfter.workflow_status,
      piece_label: versionAfter.piece_label,
      first_draft_stale: snapshotAfter.firstDraft.isStale,
    });

    await registerLegalDraftWorkflowResultArtifact(input, {
      snapshot: snapshotAfter,
      reply,
      summary,
      requestedAction,
      resultStatus: "completed",
      versionBefore,
      versionAfter,
      actionsExecuted,
    });

    return {
      status: "executed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotAfter.processTask.id,
        case_brain_task_id: snapshotAfter.caseBrain.taskId,
        draft_version_id: versionAfter.id,
        draft_version_number: versionAfter.version_number,
        draft_workflow_status: versionAfter.workflow_status,
        workflow_action_requested: requestedAction,
        workflow_actions_executed: actionsExecuted,
        piece_label: versionAfter.piece_label,
      },
      data: {
        snapshot: snapshotAfter,
        version: versionAfter,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Nao foi possivel atualizar o workflow formal da minuta agora.";
    await registerLegalDraftWorkflowResultArtifact(input, {
      snapshot: snapshotBefore,
      reply: errorMessage,
      summary: "A solicitacao formal do workflow da minuta falhou no MAYUS.",
      requestedAction,
      resultStatus: "failed",
      versionBefore,
      errorMessage,
    });

    return {
      status: "failed",
      reply: errorMessage,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
        draft_version_id: versionBefore.id,
        draft_version_number: versionBefore.version_number,
        workflow_action_requested: requestedAction,
      },
    };
  }
}

async function runLegalFirstDraftGenerate(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const snapshotBefore = await getLegalCaseContextSnapshot({
    tenantId: input.tenantId,
    entities: input.entities,
  });

  if (!snapshotBefore.caseBrain.taskId || !snapshotBefore.caseBrain.recommendedPieceInput) {
    const reply = `O processo ${snapshotBefore.processTask.processNumber || snapshotBefore.processTask.title} ainda nao tem um draft plan juridico pronto. Rode o Case Brain antes de pedir a primeira minuta.`;
    await registerLegalFirstDraftResultArtifact(input, {
      snapshot: snapshotBefore,
      reply,
      summary: "O draft plan juridico ainda nao esta pronto para gerar a primeira minuta.",
      resultStatus: "missing_draft_plan",
    });

    return {
      status: "failed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
      },
    };
  }

  if (snapshotBefore.firstDraft.status === "running") {
    const reply = snapshotBefore.firstDraft.isStale && snapshotBefore.firstDraft.artifactId
      ? `A Draft Factory juridica ja esta atualizando a minuta de ${snapshotBefore.processTask.processNumber || snapshotBefore.processTask.title} com o novo contexto do Case Brain.`
      : `A Draft Factory juridica ja esta gerando a primeira minuta de ${snapshotBefore.processTask.processNumber || snapshotBefore.processTask.title}.`;

    await registerLearningEvent(input, "legal_first_draft_requested_via_chat", {
      summary: reply,
      process_task_id: snapshotBefore.processTask.id,
      process_number: snapshotBefore.processTask.processNumber,
      case_brain_task_id: snapshotBefore.caseBrain.taskId,
      draft_factory_status: snapshotBefore.firstDraft.status,
      first_draft_stale: snapshotBefore.firstDraft.isStale,
    });

    await registerLegalFirstDraftResultArtifact(input, {
      snapshot: snapshotBefore,
      reply,
      summary: snapshotBefore.firstDraft.isStale && snapshotBefore.firstDraft.artifactId
        ? "A Draft Factory juridica ja esta atualizando a primeira minuta com o contexto atual do Case Brain."
        : "A Draft Factory juridica ja esta executando a primeira minuta solicitada.",
      resultStatus: "running",
      firstDraftStaleBefore: snapshotBefore.firstDraft.isStale,
    });

    return {
      status: "executed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
        first_draft_status: snapshotBefore.firstDraft.status,
        first_draft_stale: snapshotBefore.firstDraft.isStale,
      },
      data: snapshotBefore,
    };
  }

  try {
    const execution = await executeDraftFactoryForProcessTask({
      tenantId: input.tenantId,
      userId: input.userId || null,
      processTaskId: snapshotBefore.processTask.id,
      trigger: "manual_draft_factory",
    });
    const snapshotAfter = await getLegalCaseContextSnapshot({
      tenantId: input.tenantId,
      entities: { process_task_id: snapshotBefore.processTask.id },
    });
    const pieceLabel = execution.recommendedPieceLabel || execution.result.pieceLabel;
    const processLabel = snapshotAfter.processTask.processNumber || snapshotAfter.processTask.title;

    const summary = execution.alreadyExisting
      ? `A primeira minuta ${pieceLabel} de ${processLabel} ja estava disponivel e segue pronta para revisao humana.`
      : snapshotBefore.firstDraft.isStale
        ? `A primeira minuta ${pieceLabel} de ${processLabel} foi atualizada com o novo contexto do Case Brain.`
        : snapshotBefore.firstDraft.status === "failed"
          ? `Retry concluido. A primeira minuta ${pieceLabel} de ${processLabel} foi gerada com sucesso.`
          : `A primeira minuta ${pieceLabel} de ${processLabel} foi gerada pela Draft Factory juridica.`;
    let reply = summary;

    if (snapshotAfter.firstDraft.summary) {
      reply += `\n\n${snapshotAfter.firstDraft.summary}`;
    }

    if (snapshotAfter.caseBrain.missingDocuments.length > 0) {
      reply += `\n\nPendencias documentais atuais: ${snapshotAfter.caseBrain.missingDocuments.join("; ")}.`;
    }

    if (execution.result.requiresHumanReview) {
      reply += "\n\nA revisao humana continua obrigatoria antes de qualquer protocolo ou publicacao.";
    }

    await registerLearningEvent(input, "legal_first_draft_requested_via_chat", {
      summary: reply,
      process_task_id: snapshotAfter.processTask.id,
      process_number: snapshotAfter.processTask.processNumber,
      client_name: snapshotAfter.processTask.clientName,
      case_brain_task_id: snapshotAfter.caseBrain.taskId,
      draft_factory_task_id: execution.draftFactoryTaskId,
      artifact_id: execution.artifactId,
      already_existing: execution.alreadyExisting === true,
      first_draft_stale_before: snapshotBefore.firstDraft.isStale,
      piece_label: pieceLabel,
    });

    await registerLegalFirstDraftResultArtifact(input, {
      snapshot: snapshotAfter,
      reply,
      summary,
      resultStatus: "completed",
      execution,
      firstDraftStaleBefore: snapshotBefore.firstDraft.isStale,
    });

    return {
      status: "executed",
      reply,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotAfter.processTask.id,
        case_brain_task_id: snapshotAfter.caseBrain.taskId,
        draft_factory_task_id: execution.draftFactoryTaskId,
        case_first_draft_artifact_id: execution.artifactId,
        first_draft_status: snapshotAfter.firstDraft.status,
        first_draft_stale: snapshotAfter.firstDraft.isStale,
        recommended_piece_label: pieceLabel,
      },
      data: {
        execution,
        snapshot: snapshotAfter,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Nao foi possivel gerar a primeira minuta juridica agora.";
    await registerLegalFirstDraftResultArtifact(input, {
      snapshot: snapshotBefore,
      reply: errorMessage,
      summary: "A solicitacao juridica do MAYUS falhou antes de concluir a primeira minuta.",
      resultStatus: "failed",
      firstDraftStaleBefore: snapshotBefore.firstDraft.isStale,
      errorMessage,
    });

    return {
      status: "failed",
      reply: errorMessage,
      outputPayload: {
        auditLogId: input.auditLogId || null,
        handler_type: input.handlerType,
        process_task_id: snapshotBefore.processTask.id,
      },
    };
  }
}

export async function dispatchCapabilityExecution(input: DispatchCapabilityInput): Promise<DispatchCapabilityResult> {
  const handler = String(input.handlerType || "").trim();

  switch (handler) {
    case "growth_marketing_copywriter":
      return runGrowthMarketingCopywriter(input);
    case "growth_marketing_ops_assistant":
      return runGrowthMarketingOpsAssistant(input);
    case "growth_sales_profile_setup":
      return runGrowthSalesProfileSetup(input);
    case "growth_sales_consultation":
      return runGrowthSalesConsultation(input);
    case "growth_commercial_playbook_setup":
      return runGrowthCommercialPlaybookSetup(input);
    case "growth_lead_reactivation":
      return runGrowthColdLeadReactivation(input);
    case "growth_client_acceptance_record":
      return runGrowthClientAcceptanceRecord(input);
    case "growth_external_action_preview":
      return runGrowthExternalActionPreview(input);
    case "growth_revenue_flow_plan":
      return runGrowthRevenueFlowPlan(input);
    case "growth_lead_schedule":
      return runGrowthLeadSchedule(input);
    case "growth_lead_followup":
      return runGrowthLeadFollowup(input);
    case "growth_lead_qualify":
      return runGrowthLeadQualify(input);
    case "growth_lead_intake":
      return runGrowthLeadIntake(input);
    case "lex_process_mission_plan":
      return runLegalProcessMissionPlan(input);
    case "lex_process_mission_execute_next":
      return runLegalProcessMissionExecuteNext(input);
    case "lex_case_context":
      return runLegalCaseContext(input);
    case "lex_support_case_status":
      return runSupportCaseStatus(input);
    case "lex_document_memory_refresh":
      return runLegalDocumentMemoryRefresh(input);
    case "lex_first_draft_generate":
      return runLegalFirstDraftGenerate(input);
    case "lex_draft_revision_loop":
      return runLegalDraftRevisionLoop(input);
    case "lex_artifact_publish_premium":
      return runLegalArtifactPublishPremium(input);
    case "lex_draft_workflow":
      return runLegalDraftWorkflow(input);
    case "lex_draft_review_guidance":
      return runLegalDraftReviewGuidance(input);
    case "zapsign_contract":
    case "contract_generate":
      return runZapSignContract(input);
    case "proposal_generate":
      return runProposalGenerate(input);
    case "escavador_consulta":
      return runEscavadorConsulta(input);
    case "escavador_oab":
      return {
        status: "blocked",
        reply: "Consulta de OAB via IA esta temporariamente bloqueada por protecao de custos. Use o botao 'Atualizar Escavador' no painel de monitoramento.",
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
        },
      };
    case "escavador_cpf":
      return runEscavadorCpf(input);
    case "asaas_cobrar":
    case "billing_create":
      return runAsaasBilling(input);
    case "kanban_update":
      return runKanbanUpdate(input);
    case "calculator": {
      const result = executarCalculo({ expressao: input.entities.expressao || input.entities.expression || "" });
      if (!result.success) {
        return { status: "failed", reply: `Erro no calculo: ${result.error}` };
      }
      return {
        status: "executed",
        reply: `Calculo realizado com precisao: ${result.formatado}`,
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
          result: result.formatado,
        },
      };
    }
    case "whatsapp_process_query":
      return runWhatsAppContext(input);
    case "whatsapp_send":
    case "whatsapp_followup":
      return runWhatsAppSend(input);
    case "escavador_monitor":
    case "process_monitor_activate":
      return runEscavadorMonitor(input);
    case "kanban_import_oab":
      return {
        status: "blocked",
        reply: "Importacao por OAB via IA esta temporariamente bloqueada por protecao de custos. Use o painel de monitoramento com confirmacao explicita.",
        outputPayload: {
          auditLogId: input.auditLogId || null,
          handler_type: input.handlerType,
        },
      };
    default:
      return {
        status: "unsupported",
        reply: `Acao "${input.capabilityName}" autorizada e registrada. A execucao server-side desta capability ainda sera conectada ao runtime central.`,
      };
  }
}
