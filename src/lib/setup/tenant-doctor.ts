export type TenantDoctorStatus = "ok" | "fixed" | "warning" | "blocked";
export type TenantDoctorCategory = "tenant" | "crm" | "skills" | "integrations" | "commercial" | "audit";

export type TenantDoctorCheck = {
  id: string;
  category: TenantDoctorCategory;
  status: TenantDoctorStatus;
  title: string;
  detail: string;
  autoFixable: boolean;
  fixed?: boolean;
  nextAction?: string | null;
};

export type TenantDoctorReadinessLevel = "ready" | "almost_ready" | "needs_setup" | "blocked";

export type TenantDoctorRecommendedAction = {
  id: string;
  category: TenantDoctorCategory;
  title: string;
  detail: string;
  action: string;
  sourceCheckId: string;
  requiresHumanAction: boolean;
};

export type TenantDoctorReport = {
  tenantId: string;
  ready: boolean;
  autoFixApplied: boolean;
  readinessScore: number;
  readinessLevel: TenantDoctorReadinessLevel;
  recommendedAction: TenantDoctorRecommendedAction;
  summary: {
    ok: number;
    fixed: number;
    warning: number;
    blocked: number;
  };
  checks: TenantDoctorCheck[];
  brainTrace?: {
    taskId: string;
    runId: string;
    stepId: string;
    artifactId: string | null;
    eventType: "tenant_setup_doctor_report_created";
  } | null;
};

export type TenantBetaWorkMode = {
  report: TenantDoctorReport;
  taskId: string | null;
  artifactId: string | null;
  readinessScore: number;
  readinessLevel: TenantDoctorReadinessLevel;
  workQueue: Array<{
    id: string;
    title: string;
    detail: string;
    priority: "high" | "medium" | "low";
    requiresApproval: boolean;
    status?: "queued" | "awaiting_approval";
    stepId?: string | null;
  }>;
};

export type TenantBetaStepExecution = {
  taskId: string;
  stepId: string;
  stepKey: string;
  title: string;
  status: "completed";
  taskStatus: "executing" | "awaiting_approval" | "completed";
  remainingQueued: number;
  remainingAwaitingApproval: number;
  artifactId: string | null;
  summary: string;
};

export type TenantBetaRunSafeQueueResult = {
  taskId: string | null;
  executions: TenantBetaStepExecution[];
  finalStatus: "executing" | "awaiting_approval" | "completed" | "idle";
  summary: string;
};

type DoctorSupabase = {
  from: (table: string) => any;
};

type EnsureDefaultSkills = (tenantId: string) => Promise<unknown>;
type ListIntegrations = (tenantId: string, providers?: string[]) => Promise<Array<{
  provider?: string | null;
  status?: string | null;
  has_api_key?: boolean | null;
  has_webhook_secret?: boolean | null;
}>>;
type GoogleDriveConfigured = () => boolean;

type TenantDoctorDependencies = {
  supabase?: DoctorSupabase;
  ensureDefaultSkills?: EnsureDefaultSkills;
  listIntegrations?: ListIntegrations;
  googleDriveConfigured?: GoogleDriveConfigured;
};

const REQUIRED_INTEGRATIONS = [
  "openrouter",
  "openai",
  "google_drive",
  "zapsign",
  "asaas",
  "escavador",
  "elevenlabs",
] as const;

const DEFAULT_CRM_STAGES = [
  { name: "Novo Lead", color: "#3b82f6", order_index: 0 },
  { name: "Qualificacao", color: "#fbbf24", order_index: 1 },
  { name: "Fechado", color: "#10b981", order_index: 2, is_win: true },
  { name: "Perdido", color: "#ef4444", order_index: 3, is_loss: true },
];

function check(params: TenantDoctorCheck): TenantDoctorCheck {
  return params;
}

export function summarizeTenantDoctorChecks(checks: TenantDoctorCheck[]) {
  return checks.reduce(
    (summary, item) => {
      summary[item.status] += 1;
      return summary;
    },
    { ok: 0, fixed: 0, warning: 0, blocked: 0 },
  );
}

export function buildTenantDoctorReadiness(checks: TenantDoctorCheck[]): {
  score: number;
  level: TenantDoctorReadinessLevel;
  recommendedAction: TenantDoctorRecommendedAction;
} {
  const total = Math.max(checks.length, 1);
  const score = Math.max(0, Math.min(100, Math.round(
    checks.reduce((sum, item) => {
      if (item.status === "ok" || item.status === "fixed") return sum + 1;
      if (item.status === "warning") return sum + 0.45;
      return sum;
    }, 0) / total * 100,
  )));

  const firstBlocked = checks.find((item) => item.status === "blocked");
  const firstFixable = checks.find((item) => item.autoFixable && item.status !== "ok" && item.status !== "fixed");
  const firstWarning = checks.find((item) => item.status === "warning");
  const source = firstBlocked || firstFixable || firstWarning || checks[0];
  const level: TenantDoctorReadinessLevel = firstBlocked
    ? "blocked"
    : firstFixable || firstWarning
      ? score >= 75 ? "almost_ready" : "needs_setup"
      : "ready";

  if (!source || level === "ready") {
    return {
      score,
      level,
      recommendedAction: {
        id: "ready:operate",
        category: "audit",
        title: "Tenant pronto para operar",
        detail: "O MAYUS nao encontrou bloqueios ou avisos criticos no setup atual.",
        action: "Abrir o Playbook Diario ou iniciar uma missao operacional pelo MAYUS.",
        sourceCheckId: "setup:ready",
        requiresHumanAction: false,
      },
    };
  }

  return {
    score,
    level,
    recommendedAction: {
      id: `next:${source.id}`,
      category: source.category,
      title: source.status === "blocked" ? "Remover bloqueio principal" : "Fechar proxima configuracao",
      detail: `${source.title}: ${source.detail}`,
      action: source.nextAction || (source.autoFixable
        ? "Rodar o Setup Doctor com correcao segura e revisar o artifact gerado no MAYUS."
        : "Revisar esta pendencia com um usuario autorizado antes de liberar automacao."),
      sourceCheckId: source.id,
      requiresHumanAction: source.status === "blocked" || !source.autoFixable,
    },
  };
}

function sanitizeDoctorCheckForArtifact(item: TenantDoctorCheck) {
  return {
    id: item.id,
    category: item.category,
    status: item.status,
    title: item.title,
    detail: item.detail,
    autoFixable: item.autoFixable,
    fixed: item.fixed === true,
    nextAction: item.nextAction || null,
  };
}

export function buildTenantDoctorArtifactMetadata(report: TenantDoctorReport) {
  const fixedChecks = report.checks.filter((item) => item.status === "fixed");
  const blockedChecks = report.checks.filter((item) => item.status === "blocked");
  const warningChecks = report.checks.filter((item) => item.status === "warning");
  const humanActions = [...blockedChecks, ...warningChecks]
    .map((item) => item.nextAction)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  return {
    summary: report.ready
      ? "Setup Doctor concluiu que o tenant esta pronto para operar."
      : `Setup Doctor encontrou ${blockedChecks.length} bloqueio(s) e ${warningChecks.length} aviso(s) que exigem acompanhamento.`,
    ready: report.ready,
    auto_fix_applied: report.autoFixApplied,
    ok_count: report.summary.ok,
    fixed_count: report.summary.fixed,
    warning_count: report.summary.warning,
    blocked_count: report.summary.blocked,
    readiness_score: report.readinessScore,
    readiness_level: report.readinessLevel,
    recommended_action: report.recommendedAction,
    fixed_checks: fixedChecks.map(sanitizeDoctorCheckForArtifact),
    blocked_checks: blockedChecks.map(sanitizeDoctorCheckForArtifact),
    warning_checks: warningChecks.map(sanitizeDoctorCheckForArtifact),
    checks: report.checks.map(sanitizeDoctorCheckForArtifact),
    human_actions: humanActions,
    requires_human_action: humanActions.length > 0,
  };
}

function shouldCreateDoctorArtifact(report: TenantDoctorReport) {
  return report.autoFixApplied && (
    report.summary.fixed > 0 ||
    report.summary.warning > 0 ||
    report.summary.blocked > 0
  );
}

function buildTenantBetaStepSummary(stepKey: string, title: string) {
  if (stepKey === "core:daily_playbook") {
    return "Playbook Diario colocado como proxima rotina operacional do beta, sem envio externo automatico.";
  }
  if (stepKey === "growth:crm_next_steps") {
    return "CRM marcado para organizacao de leads sem proximo passo, com execucao supervisionada.";
  }
  if (stepKey === "lex:support_case_status") {
    return "Atendimento de status de caso colocado em trilha segura, usando base confirmada e handoff quando necessario.";
  }
  return `${title} executado em modo beta supervisionado.`;
}

function buildTenantBetaStepMetadata(step: { step_key: string; title: string; output_payload?: any }) {
  return {
    summary: buildTenantBetaStepSummary(step.step_key, step.title),
    step_key: step.step_key,
    step_title: step.title,
    detail: step.output_payload?.detail || null,
    external_side_effects_blocked: true,
    executed_mode: "supervised_beta",
  };
}

function normalizeTenantBetaAiFeatures(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTenantBetaDailyPlaybookPreferences(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return {
    enabled: value.enabled === true,
    timezone: typeof value.timezone === "string" ? value.timezone : undefined,
    deliveryTime: typeof value.deliveryTime === "string" ? value.deliveryTime : typeof value.delivery_time === "string" ? value.delivery_time : undefined,
    weekdays: Array.isArray(value.weekdays) ? value.weekdays : undefined,
    channels: Array.isArray(value.channels) ? value.channels : undefined,
    scope: typeof value.scope === "string" ? value.scope : undefined,
    detailLevel: typeof value.detailLevel === "string" ? value.detailLevel : typeof value.detail_level === "string" ? value.detail_level : undefined,
  };
}

async function fetchTenantBetaCrmTasks(tenantId: string, supabase: DoctorSupabase) {
  const { data: pipelines, error: pipelinesError } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("tenant_id", tenantId);

  if (pipelinesError) throw pipelinesError;
  const pipelineIds = (pipelines || []).map((pipeline: any) => pipeline.id).filter(Boolean);
  if (pipelineIds.length === 0) return [];

  const { data: stages, error: stagesError } = await supabase
    .from("crm_stages")
    .select("id,name,is_win,is_loss")
    .in("pipeline_id", pipelineIds);

  if (stagesError) throw stagesError;
  const stageById = new Map((stages || []).map((stage: any) => [stage.id, stage]));

  const { data, error } = await supabase
    .from("crm_tasks")
    .select("id,title,description,tags,sector,stage_id,phone,assigned_to,created_at,data_ultima_movimentacao")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw error;

  return (data || []).map((task: any) => {
    const stage = stageById.get(task.stage_id) as any;
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      tags: Array.isArray(task.tags) ? task.tags : [],
      sector: task.sector,
      stageName: stage?.name || null,
      phone: task.phone,
      isWin: stage?.is_win === true,
      isLoss: stage?.is_loss === true,
      created_at: task.created_at,
      data_ultima_movimentacao: task.data_ultima_movimentacao,
    };
  });
}

async function fetchTenantBetaUserTasks(tenantId: string, supabase: DoctorSupabase) {
  const { data, error } = await supabase
    .from("user_tasks")
    .select("id,title,description,urgency,status,scheduled_for,assigned_name_snapshot,client_name,type")
    .eq("tenant_id", tenantId)
    .order("scheduled_for", { ascending: true })
    .limit(120);

  if (error) throw error;
  return data || [];
}

function normalizeStringArray(value: any) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

async function fetchTenantBetaSupportCaseSnapshot(tenantId: string, supabase: DoctorSupabase) {
  const { data: processTask, error: processError } = await supabase
    .from("process_tasks")
    .select("id,pipeline_id,stage_id,title,client_name,process_number,demanda,description,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (processError) throw processError;
  if (!processTask?.id) throw new Error("beta_support_case_not_found");

  const [{ data: documentMemory, error: memoryError }, { data: stage, error: stageError }, { data: pipeline, error: pipelineError }] = await Promise.all([
    supabase
      .from("process_document_memory")
      .select("summary_master, missing_documents, current_phase, document_count, sync_status, last_synced_at, case_brain_task_id")
      .eq("tenant_id", tenantId)
      .eq("process_task_id", processTask.id)
      .maybeSingle(),
    processTask.stage_id
      ? supabase.from("process_stages").select("id,name").eq("id", processTask.stage_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    processTask.pipeline_id
      ? supabase.from("process_pipelines").select("id,name").eq("id", processTask.pipeline_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (memoryError) throw memoryError;
  if (stageError) throw stageError;
  if (pipelineError) throw pipelineError;

  const documentCount = Number(documentMemory?.document_count || 0);
  const hasDocumentMemory = Boolean(documentMemory?.summary_master || documentMemory?.current_phase || documentCount > 0);

  return {
    processTask: {
      id: String(processTask.id),
      title: String(processTask.title || "Processo sem titulo"),
      clientName: processTask.client_name || null,
      processNumber: processTask.process_number || null,
      legalArea: processTask.demanda || null,
      description: processTask.description || null,
      pipelineName: pipeline?.name || null,
      stageName: stage?.name || null,
      createdAt: processTask.created_at,
    },
    caseBrain: {
      taskId: documentMemory?.case_brain_task_id || null,
      caseId: null,
      summaryMaster: documentMemory?.summary_master || null,
      currentPhase: documentMemory?.current_phase || null,
      queriesCount: 0,
      keyFactsCount: 0,
      recommendedPieceInput: null,
      recommendedPieceLabel: null,
      firstActions: [],
      missingDocuments: normalizeStringArray(documentMemory?.missing_documents),
      validatedInternalSourcesCount: 0,
      validatedLawReferencesCount: 0,
      validatedCaseLawReferencesCount: 0,
      externalValidationGapCount: 0,
      pendingValidationCount: 0,
      readyForFactCitations: false,
      readyForLawCitations: false,
      readyForCaseLawCitations: false,
    },
    documentMemory: {
      documentCount,
      syncStatus: documentMemory?.sync_status || null,
      lastSyncedAt: documentMemory?.last_synced_at || null,
      summaryMaster: documentMemory?.summary_master || null,
      currentPhase: documentMemory?.current_phase || null,
      missingDocuments: normalizeStringArray(documentMemory?.missing_documents),
      freshness: hasDocumentMemory ? "fresh" as const : "missing" as const,
    },
    firstDraft: {
      status: "idle" as const,
      isStale: false,
      artifactId: null,
      taskId: null,
      caseBrainTaskId: null,
      summary: null,
      error: null,
      generatedAt: null,
      pieceType: null,
      pieceLabel: null,
      recommendedPieceInput: null,
      recommendedPieceLabel: null,
      practiceArea: null,
      requiresHumanReview: true,
      warningCount: 0,
    },
  };
}

async function runTenantBetaStepHandler(params: {
  tenantId: string;
  userId: string | null;
  taskId: string;
  runId: string | null;
  stepId: string;
  stepKey: string;
  supabase: DoctorSupabase;
}) {
  if (params.stepKey !== "core:daily_playbook") {
    if (params.stepKey !== "growth:crm_next_steps") {
      if (params.stepKey !== "lex:support_case_status") {
        return {};
      }

      const {
        buildSupportCaseStatusContract,
        buildSupportCaseStatusReply,
      } = await import("@/lib/lex/case-context");
      const snapshot = await fetchTenantBetaSupportCaseSnapshot(params.tenantId, params.supabase);
      const contract = buildSupportCaseStatusContract(snapshot);
      const reply = buildSupportCaseStatusReply(contract);
      const summary = contract.responseMode === "handoff"
        ? `Status do caso ${contract.processLabel} encaminhado para handoff humano.`
        : `Status do caso ${contract.processLabel} preparado com confianca ${contract.confidence}.`;
      const metadata = {
        reply,
        summary,
        source: "tenant_beta_workplan",
        process_task_id: snapshot.processTask.id,
        process_number: snapshot.processTask.processNumber,
        process_label: contract.processLabel,
        client_name: snapshot.processTask.clientName,
        case_brain_task_id: snapshot.caseBrain.taskId,
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
        external_side_effects_blocked: true,
      };

      const { data: artifact, error: artifactError } = await params.supabase
        .from("brain_artifacts")
        .insert({
          tenant_id: params.tenantId,
          task_id: params.taskId,
          run_id: params.runId,
          step_id: params.stepId,
          artifact_type: "support_case_status",
          title: `Beta - Status do caso ${snapshot.processTask.clientName || snapshot.processTask.title}`,
          mime_type: "application/json",
          source_module: "lex",
          metadata,
        })
        .select("id")
        .single();

      if (artifactError) throw artifactError;

      return {
        handled_capability: "lex_support_case_status",
        beta_handler_summary: summary,
        support_case_status_artifact_id: artifact?.id || null,
        support_status_response_mode: contract.responseMode,
        support_status_confidence: contract.confidence,
        support_status_handoff_reason: contract.handoffReason,
        support_status_missing_signal_count: contract.grounding.missingSignals.length,
      };
    }

    const {
      buildMarketingOpsAssistantMetadata,
      buildMarketingOpsAssistantPlan,
    } = await import("@/lib/growth/marketing-ops-assistant");
    const { data: settings, error: settingsError } = await params.supabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", params.tenantId)
      .maybeSingle();

    if (settingsError) throw settingsError;
    const aiFeatures = normalizeTenantBetaAiFeatures(settings?.ai_features);
    const crmTasks = await fetchTenantBetaCrmTasks(params.tenantId, params.supabase);
    const plan = buildMarketingOpsAssistantPlan({
      request: "leads sem proximo passo no CRM",
      state: aiFeatures.marketing_os && typeof aiFeatures.marketing_os === "object" ? aiFeatures.marketing_os : null,
      crmTasks,
    });
    const metadata = {
      ...buildMarketingOpsAssistantMetadata(plan),
      source: "tenant_beta_workplan",
      external_side_effects_blocked: true,
    };

    const { data: artifact, error: artifactError } = await params.supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: params.taskId,
        run_id: params.runId,
        step_id: params.stepId,
        artifact_type: "marketing_ops_assistant_plan",
        title: "Beta - CRM sem proximo passo",
        mime_type: "application/json",
        source_module: "growth",
        metadata,
      })
      .select("id")
      .single();

    if (artifactError) throw artifactError;

    return {
      handled_capability: "growth_crm_next_steps",
      beta_handler_summary: plan.summary,
      crm_next_steps_artifact_id: artifact?.id || null,
      crm_next_steps_count: plan.leadsNeedingNextStep.length,
      crm_next_steps_recommended_actions: plan.recommendedActions,
      requires_human_approval: plan.humanApprovalRequired,
    };
  }

  const {
    buildDailyPlaybook,
    buildDailyPlaybookMetadata,
  } = await import("@/lib/mayus/daily-playbook");

  const { data: settings, error: settingsError } = await params.supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (settingsError) throw settingsError;
  const aiFeatures = normalizeTenantBetaAiFeatures(settings?.ai_features);
  const [crmTasks, userTasks] = await Promise.all([
    fetchTenantBetaCrmTasks(params.tenantId, params.supabase),
    fetchTenantBetaUserTasks(params.tenantId, params.supabase),
  ]);
  const playbook = buildDailyPlaybook({
    firmName: typeof aiFeatures.firm_name === "string" ? aiFeatures.firm_name : null,
    preferences: normalizeTenantBetaDailyPlaybookPreferences(aiFeatures.daily_playbook),
    crmTasks,
    userTasks,
  });
  const metadata = buildDailyPlaybookMetadata(playbook);

  const { data: artifact, error: artifactError } = await params.supabase
    .from("brain_artifacts")
    .insert({
      tenant_id: params.tenantId,
      task_id: params.taskId,
      run_id: params.runId,
      step_id: params.stepId,
      artifact_type: "daily_playbook",
      title: playbook.title,
      mime_type: "application/json",
      source_module: "mayus",
      metadata: {
        ...metadata,
        source: "tenant_beta_workplan",
        external_side_effects_blocked: true,
      },
    })
    .select("id")
    .single();

  if (artifactError) throw artifactError;

  return {
    handled_capability: "daily_playbook",
    daily_playbook_artifact_id: artifact?.id || null,
    daily_playbook_summary: playbook.executiveSummary,
    daily_playbook_metrics: playbook.metrics,
  };
}

export function buildTenantBetaWorkQueue(report: TenantDoctorReport): TenantBetaWorkMode["workQueue"] {
  const queue: TenantBetaWorkMode["workQueue"] = [];

  if (report.recommendedAction.id !== "ready:operate") {
    queue.push({
      id: "setup:next_best_action",
      title: report.recommendedAction.title,
      detail: report.recommendedAction.action,
      priority: report.recommendedAction.requiresHumanAction ? "high" : "medium",
      requiresApproval: report.recommendedAction.requiresHumanAction,
    });
  }

  queue.push({
    id: "core:daily_playbook",
    title: "Gerar Playbook Diario MAYUS",
    detail: "Criar resumo executivo com agenda, CRM, juridico, financeiro, marketing e proximas acoes sem envio externo automatico.",
    priority: report.readinessLevel === "blocked" ? "medium" : "high",
    requiresApproval: false,
  });

  queue.push({
    id: "growth:crm_next_steps",
    title: "Organizar leads sem proximo passo",
    detail: "Identificar oportunidades abertas sem data, canal ou responsavel e preparar plano supervisionado.",
    priority: "high",
    requiresApproval: false,
  });

  queue.push({
    id: "lex:support_case_status",
    title: "Responder status de caso com base confirmada",
    detail: "Usar andamento, fase, pendencias e inferencias marcadas para atendimento seguro e handoff humano quando necessario.",
    priority: "medium",
    requiresApproval: false,
  });

  return queue.slice(0, 5);
}

async function registerTenantBetaWorkMode(params: {
  tenantId: string;
  userId: string | null;
  report: TenantDoctorReport;
  workQueue: TenantBetaWorkMode["workQueue"];
  supabase: DoctorSupabase;
}) {
  const now = new Date().toISOString();
  const baseQueue = params.workQueue.map((item, index) => ({
    ...item,
    order_index: index + 2,
    status: item.requiresApproval ? "awaiting_approval" as const : "queued" as const,
  }));
  const metadata = {
    summary: `Modo Beta MAYUS iniciado com ${params.report.readinessScore}% de prontidao.`,
    readiness_score: params.report.readinessScore,
    readiness_level: params.report.readinessLevel,
    recommended_action: params.report.recommendedAction,
    work_queue: baseQueue,
    external_side_effects_blocked: true,
    approval_required_for_sensitive_actions: true,
  };

  try {
    const { data: task, error: taskError } = await params.supabase
      .from("brain_tasks")
      .insert({
        tenant_id: params.tenantId,
        created_by: params.userId,
        channel: "settings",
        module: "setup",
        status: "executing",
        title: "Modo Beta MAYUS",
        goal: "Iniciar operacao beta supervisionada com fila de trabalho auditavel.",
        task_input: {
          trigger: "api.setup.beta",
          readiness_score: params.report.readinessScore,
        },
        task_context: {
          source: "dashboard.configuracoes",
          artifact_type: "tenant_beta_workplan",
        },
        policy_snapshot: {
          secrets_allowed: false,
          external_side_effects: false,
          sensitive_actions_require_approval: true,
        },
        result_summary: `${metadata.summary} ${baseQueue.length} item(ns) foram colocados em execucao supervisionada.`,
        started_at: now,
      })
      .select("id")
      .single();

    if (taskError || !task?.id) throw taskError || new Error("brain_task_missing");

    const { data: run, error: runError } = await params.supabase
      .from("brain_runs")
      .insert({
        task_id: task.id,
        tenant_id: params.tenantId,
        attempt_number: 1,
        status: "executing",
        summary: metadata.summary,
        started_at: now,
      })
      .select("id")
      .single();

    if (runError || !run?.id) throw runError || new Error("brain_run_missing");

    const { data: step, error: stepError } = await params.supabase
      .from("brain_steps")
      .insert({
        task_id: task.id,
        run_id: run.id,
        tenant_id: params.tenantId,
        order_index: 1,
        step_key: "tenant_beta_workplan",
        title: "Organizar fila beta supervisionada",
        step_type: "operation",
        capability_name: "tenant_beta_workplan",
        handler_type: "setup_doctor",
        status: "completed",
        input_payload: {
          readiness_score: params.report.readinessScore,
          readiness_level: params.report.readinessLevel,
        },
        output_payload: metadata,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (stepError || !step?.id) throw stepError || new Error("brain_step_missing");

    const { data: queueSteps, error: queueStepsError } = await params.supabase
      .from("brain_steps")
      .insert(baseQueue.map((item) => ({
        task_id: task.id,
        run_id: run.id,
        tenant_id: params.tenantId,
        order_index: item.order_index,
        step_key: item.id,
        title: item.title,
        step_type: item.requiresApproval ? "approval_checkpoint" : "operation",
        capability_name: item.id,
        handler_type: "tenant_beta_work_mode",
        status: item.status,
        input_payload: {
          priority: item.priority,
          requires_approval: item.requiresApproval,
          source: "tenant_beta_workplan",
        },
        output_payload: {
          detail: item.detail,
          external_side_effects_blocked: true,
        },
        started_at: item.status === "queued" ? null : now,
        completed_at: null,
      })))
      .select("id, step_key");

    if (queueStepsError) throw queueStepsError;

    const queueWithSteps = baseQueue.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      priority: item.priority,
      requiresApproval: item.requiresApproval,
      order_index: item.order_index,
      status: item.status,
      stepId: (queueSteps || []).find((row: any) => row.step_key === item.id)?.id || null,
    }));
    metadata.work_queue = queueWithSteps;

    const approvalRows = queueWithSteps
      .filter((item) => item.requiresApproval && item.stepId)
      .map((item) => ({
        task_id: task.id,
        run_id: run.id,
        step_id: item.stepId,
        tenant_id: params.tenantId,
        requested_by: params.userId,
        status: "pending",
        risk_level: item.priority === "high" ? "medium" : "low",
        approval_context: {
          source: "tenant_beta_workplan",
          awaiting_payload: {
            action_id: item.id,
            title: item.title,
            detail: item.detail,
            external_side_effects_blocked: true,
          },
        },
      }));

    if (approvalRows.length > 0) {
      const { error: approvalError } = await params.supabase.from("brain_approvals").insert(approvalRows);
      if (approvalError) throw approvalError;
    }

    const { data: artifact, error: artifactError } = await params.supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        artifact_type: "tenant_beta_workplan",
        title: "Modo Beta MAYUS - fila operacional",
        mime_type: "application/json",
        source_module: "setup",
        metadata,
      })
      .select("id")
      .single();

    if (artifactError) throw artifactError;

    await params.supabase.from("learning_events").insert({
      tenant_id: params.tenantId,
      task_id: task.id,
      run_id: run.id,
      step_id: step.id,
      event_type: "tenant_beta_workplan_created",
      source_module: "setup",
      payload: {
        readiness_score: params.report.readinessScore,
        readiness_level: params.report.readinessLevel,
        work_queue_count: queueWithSteps.length,
        queued_count: queueWithSteps.filter((item) => item.status === "queued").length,
        awaiting_approval_count: queueWithSteps.filter((item) => item.status === "awaiting_approval").length,
        artifact_id: artifact?.id || null,
      },
      created_by: params.userId,
    });

    return {
      taskId: task.id as string,
      artifactId: artifact?.id ? String(artifact.id) : null,
      workQueue: queueWithSteps,
    };
  } catch (error) {
    console.error("[tenant-doctor] beta work mode", error);
    return { taskId: null, artifactId: null, workQueue: params.workQueue };
  }
}

export function buildIntegrationDoctorChecks(params: {
  integrations: Array<{
    provider?: string | null;
    status?: string | null;
    has_api_key?: boolean | null;
    has_webhook_secret?: boolean | null;
  }>;
  googleDriveConfigured: boolean;
}) {
  const byProvider = new Map(params.integrations.map((integration) => [String(integration.provider || ""), integration]));

  return REQUIRED_INTEGRATIONS.map((provider) => {
    const integration = byProvider.get(provider);
    const isConnected = integration?.status === "connected" || integration?.status === "active";
    const hasSecret = integration?.has_api_key === true || integration?.has_webhook_secret === true;

    if (provider === "google_drive" && !params.googleDriveConfigured) {
      return check({
        id: "integration:google_drive:env",
        category: "integrations",
        status: "blocked",
        title: "Google Drive sem OAuth valido",
        detail: "As variaveis locais do OAuth Google Drive estao ausentes ou malformadas.",
        autoFixable: false,
        nextAction: "Configurar client ID e credencial OAuth validos e reconectar a conta Google Drive.",
      });
    }

    if (isConnected || hasSecret) {
      return check({
        id: `integration:${provider}`,
        category: "integrations",
        status: "ok",
        title: `Integracao ${provider}`,
        detail: "Integracao possui registro seguro ou credencial resolvida no Vault.",
        autoFixable: false,
      });
    }

    return check({
      id: `integration:${provider}`,
      category: "integrations",
      status: "blocked",
      title: `Integracao ${provider} pendente`,
      detail: "Nao ha credencial segura ou conexao ativa para este provider.",
      autoFixable: false,
      nextAction: "Cadastrar credencial pelo painel de integracoes ou fluxo OAuth correspondente.",
    });
  });
}

async function ensureCrmDefaults(tenantId: string, supabase: DoctorSupabase, autoFix: boolean) {
  const checks: TenantDoctorCheck[] = [];
  const { data: pipelines, error: pipelineError } = await supabase
    .from("crm_pipelines")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (pipelineError) throw pipelineError;

  let pipelineId = String(pipelines?.[0]?.id || "");
  if (!pipelineId) {
    if (!autoFix) {
      checks.push(check({
        id: "crm:pipeline",
        category: "crm",
        status: "warning",
        title: "Pipeline CRM ausente",
        detail: "Nenhum pipeline comercial foi encontrado para o tenant.",
        autoFixable: true,
        nextAction: "Rodar o doctor com autoFix para criar o pipeline Comercial.",
      }));
      return checks;
    }

    const { data: pipeline, error: insertPipelineError } = await supabase
      .from("crm_pipelines")
      .insert({ tenant_id: tenantId, name: "Comercial" })
      .select("id")
      .single();

    if (insertPipelineError) throw insertPipelineError;
    pipelineId = String(pipeline.id);
    checks.push(check({
      id: "crm:pipeline",
      category: "crm",
      status: "fixed",
      title: "Pipeline CRM criado",
      detail: "Pipeline Comercial criado automaticamente.",
      autoFixable: true,
      fixed: true,
    }));
  } else {
    checks.push(check({
      id: "crm:pipeline",
      category: "crm",
      status: "ok",
      title: "Pipeline CRM encontrado",
      detail: "Tenant ja possui pipeline comercial.",
      autoFixable: true,
    }));
  }

  const { data: stages, error: stagesError } = await supabase
    .from("crm_stages")
    .select("id, name")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true });

  if (stagesError) throw stagesError;

  if ((stages || []).length > 0) {
    checks.push(check({
      id: "crm:stages",
      category: "crm",
      status: "ok",
      title: "Etapas CRM encontradas",
      detail: `Pipeline possui ${(stages || []).length} etapa(s).`,
      autoFixable: true,
    }));
    return checks;
  }

  if (!autoFix) {
    checks.push(check({
      id: "crm:stages",
      category: "crm",
      status: "warning",
      title: "Etapas CRM ausentes",
      detail: "Pipeline comercial existe, mas nao possui etapas.",
      autoFixable: true,
      nextAction: "Rodar o doctor com autoFix para criar etapas comerciais padrao.",
    }));
    return checks;
  }

  const { error: insertStagesError } = await supabase
    .from("crm_stages")
    .insert(DEFAULT_CRM_STAGES.map((stage) => ({ ...stage, pipeline_id: pipelineId })));

  if (insertStagesError) throw insertStagesError;

  checks.push(check({
    id: "crm:stages",
    category: "crm",
    status: "fixed",
    title: "Etapas CRM criadas",
    detail: "Etapas Novo Lead, Qualificacao, Fechado e Perdido criadas automaticamente.",
    autoFixable: true,
    fixed: true,
  }));

  return checks;
}

async function diagnoseTenantRecord(tenantId: string, supabase: DoctorSupabase) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw error;

  if (!data?.id) {
    return check({
      id: "tenant:record",
      category: "tenant",
      status: "blocked",
      title: "Tenant nao encontrado",
      detail: "Nao existe registro de tenant para a sessao atual.",
      autoFixable: false,
      nextAction: "Corrigir o profile do usuario ou criar o tenant via admin.",
    });
  }

  return check({
    id: "tenant:record",
    category: "tenant",
    status: "ok",
    title: "Tenant encontrado",
    detail: `Tenant ${data.name || data.id} esta acessivel.`,
    autoFixable: false,
  });
}

async function diagnoseAgentSkills(tenantId: string, supabase: DoctorSupabase, ensureDefaultSkills: EnsureDefaultSkills, autoFix: boolean) {
  if (autoFix) {
    await ensureDefaultSkills(tenantId);
  }

  const { data, error } = await supabase
    .from("agent_skills")
    .select("id, name, is_active")
    .eq("tenant_id", tenantId);

  if (error) throw error;

  const count = (data || []).length;
  if (count > 0) {
    return check({
      id: "skills:defaults",
      category: "skills",
      status: autoFix ? "fixed" : "ok",
      title: "Skills agenticas disponiveis",
      detail: `${count} skill(s) encontradas para o tenant.`,
      autoFixable: true,
      fixed: autoFix,
    });
  }

  return check({
    id: "skills:defaults",
    category: "skills",
    status: "warning",
    title: "Skills agenticas ausentes",
    detail: "Nenhuma skill foi encontrada para o tenant.",
    autoFixable: true,
    nextAction: "Rodar o doctor com autoFix para semear as skills padrao.",
  });
}

function getCommercialProfileMissingSignals(profile: Record<string, any> | null) {
  const missing = [
    typeof profile?.ideal_client === "string" && profile.ideal_client.trim() ? null : "cliente ideal",
    typeof profile?.core_solution === "string" && profile.core_solution.trim() ? null : "solucao central",
    typeof profile?.unique_value_proposition === "string" && profile.unique_value_proposition.trim() ? null : "PUV",
    Array.isArray(profile?.value_pillars) && profile.value_pillars.length > 0 ? null : "pilares autorais",
  ].filter(Boolean) as string[];

  return missing;
}

async function diagnoseCommercialSalesProfile(tenantId: string, supabase: DoctorSupabase) {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;

  const profile = data?.ai_features?.sales_consultation_profile && typeof data.ai_features.sales_consultation_profile === "object"
    ? data.ai_features.sales_consultation_profile as Record<string, any>
    : null;
  const missing = getCommercialProfileMissingSignals(profile);

  if (missing.length === 0) {
    return check({
      id: "commercial:sales_profile",
      category: "commercial",
      status: "ok",
      title: "Perfil comercial configurado",
      detail: "Cliente ideal, solucao, PUV e pilares comerciais estao disponiveis para o MAYUS adaptar o atendimento.",
      autoFixable: false,
    });
  }

  return check({
    id: "commercial:sales_profile",
    category: "commercial",
    status: "warning",
    title: "Perfil comercial incompleto",
    detail: `Faltam sinais para vendas consultivas: ${missing.join(", ")}.`,
    autoFixable: false,
    nextAction: "Responder no MAYUS: cliente ideal do escritorio, solucao central, PUV e 3 pilares autorais. Se nao houver PUV, pedir para o MAYUS montar uma proposta inicial.",
  });
}

async function registerDoctorEvent(params: {
  tenantId: string;
  userId: string | null;
  report: TenantDoctorReport;
  supabase: DoctorSupabase;
}) {
  const { error } = await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    source: "setup",
    provider: "mayus",
    event_name: params.report.autoFixApplied ? "tenant_doctor_autofix" : "tenant_doctor_check",
    status: params.report.ready ? "ok" : "warning",
    payload: {
      ready: params.report.ready,
      summary: params.report.summary,
      checks: params.report.checks.map((item) => ({
        id: item.id,
        status: item.status,
        category: item.category,
        fixed: item.fixed === true,
      })),
    },
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[tenant-doctor] event", error.message);
  }
}

async function registerDoctorBrainArtifact(params: {
  tenantId: string;
  userId: string | null;
  report: TenantDoctorReport;
  supabase: DoctorSupabase;
}) {
  if (!shouldCreateDoctorArtifact(params.report)) return null;

  const now = new Date().toISOString();
  const missionStatus = params.report.ready ? "completed" : "completed_with_warnings";
  const metadata = buildTenantDoctorArtifactMetadata(params.report);
  let createdTaskId: string | null = null;

  try {
    const { data: task, error: taskError } = await params.supabase
      .from("brain_tasks")
      .insert({
        tenant_id: params.tenantId,
        created_by: params.userId,
        channel: "settings",
        module: "setup",
        status: missionStatus,
        title: "Auto Setup Doctor",
        goal: "Validar e corrigir defaults seguros do tenant MAYUS.",
        task_input: {
          auto_fix: params.report.autoFixApplied,
          trigger: "api.setup.doctor",
        },
        task_context: {
          source: "dashboard.configuracoes",
          artifact_type: "tenant_setup_doctor_report",
        },
        policy_snapshot: {
          secrets_allowed: false,
          external_side_effects: false,
          human_review_required_for_integrations: true,
        },
        result_summary: metadata.summary,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (taskError || !task?.id) throw taskError || new Error("brain_task_missing");
    createdTaskId = task.id;

    const { data: run, error: runError } = await params.supabase
      .from("brain_runs")
      .insert({
        task_id: task.id,
        tenant_id: params.tenantId,
        attempt_number: 1,
        status: missionStatus,
        summary: metadata.summary,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (runError || !run?.id) throw runError || new Error("brain_run_missing");

    const { data: step, error: stepError } = await params.supabase
      .from("brain_steps")
      .insert({
        task_id: task.id,
        run_id: run.id,
        tenant_id: params.tenantId,
        order_index: 1,
        step_key: "tenant_setup_doctor",
        title: "Validar setup do tenant",
        step_type: "operation",
        capability_name: "tenant_setup_doctor_report",
        handler_type: "setup_doctor",
        status: "completed",
        input_payload: {
          auto_fix: params.report.autoFixApplied,
        },
        output_payload: {
          ready: params.report.ready,
          summary: params.report.summary,
          readiness_score: params.report.readinessScore,
          readiness_level: params.report.readinessLevel,
          recommended_action: params.report.recommendedAction,
          requires_human_action: metadata.requires_human_action,
        },
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (stepError || !step?.id) throw stepError || new Error("brain_step_missing");

    const { data: artifact, error: artifactError } = await params.supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        artifact_type: "tenant_setup_doctor_report",
        title: params.report.ready ? "Setup Doctor - tenant pronto" : "Setup Doctor - acoes pendentes",
        mime_type: "application/json",
        source_module: "setup",
        metadata,
      })
      .select("id")
      .single();

    if (artifactError) throw artifactError;

    const { error: learningError } = await params.supabase
      .from("learning_events")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        event_type: "tenant_setup_doctor_report_created",
        source_module: "setup",
        payload: {
          summary: metadata.summary,
          ready: params.report.ready,
          auto_fix_applied: params.report.autoFixApplied,
          fixed_count: metadata.fixed_count,
          blocked_count: metadata.blocked_count,
          warning_count: metadata.warning_count,
          readiness_score: metadata.readiness_score,
          readiness_level: metadata.readiness_level,
          recommended_action: metadata.recommended_action,
          requires_human_action: metadata.requires_human_action,
          artifact_id: artifact?.id || null,
        },
        created_by: params.userId,
      });

    if (learningError) {
      console.error("[tenant-doctor] learning event", learningError.message);
    }

    return {
      taskId: task.id,
      runId: run.id,
      stepId: step.id,
      artifactId: artifact?.id || null,
      eventType: "tenant_setup_doctor_report_created" as const,
    };
  } catch (error) {
    console.error("[tenant-doctor] brain artifact", error);
    if (createdTaskId) {
      await params.supabase.from("brain_tasks").delete().eq("id", createdTaskId);
    }
    return null;
  }
}

export async function runTenantDoctor(params: {
  tenantId: string;
  userId?: string | null;
  autoFix?: boolean;
  dependencies?: TenantDoctorDependencies;
}): Promise<TenantDoctorReport> {
  const autoFix = params.autoFix === true;
  const supabase = params.dependencies?.supabase || (await import("@/lib/supabase/admin")).supabaseAdmin;
  const ensureDefaultSkills = params.dependencies?.ensureDefaultSkills || (await import("@/lib/agent/capabilities/registry")).ensureDefaultAgentSkills;
  const listIntegrations = params.dependencies?.listIntegrations || (await import("@/lib/integrations/server")).listTenantIntegrationsSafe;
  const googleDriveConfigured = params.dependencies?.googleDriveConfigured || (await import("@/lib/services/google-drive")).isGoogleDriveConfigured;

  const checks: TenantDoctorCheck[] = [];

  checks.push(await diagnoseTenantRecord(params.tenantId, supabase));
  checks.push(...await ensureCrmDefaults(params.tenantId, supabase, autoFix));
  checks.push(await diagnoseAgentSkills(params.tenantId, supabase, ensureDefaultSkills, autoFix));
  checks.push(await diagnoseCommercialSalesProfile(params.tenantId, supabase));

  const integrations = await listIntegrations(params.tenantId, [...REQUIRED_INTEGRATIONS]);
  checks.push(...buildIntegrationDoctorChecks({
    integrations,
    googleDriveConfigured: googleDriveConfigured(),
  }));

  const summary = summarizeTenantDoctorChecks(checks);
  const readiness = buildTenantDoctorReadiness(checks);
  const report = {
    tenantId: params.tenantId,
    ready: summary.blocked === 0 && summary.warning === 0,
    autoFixApplied: autoFix,
    readinessScore: readiness.score,
    readinessLevel: readiness.level,
    recommendedAction: readiness.recommendedAction,
    summary,
    checks,
    brainTrace: null,
  };

  await registerDoctorEvent({
    tenantId: params.tenantId,
    userId: params.userId || null,
    report,
    supabase,
  });

  report.brainTrace = await registerDoctorBrainArtifact({
    tenantId: params.tenantId,
    userId: params.userId || null,
    report,
    supabase,
  });

  return report;
}

export async function startTenantBetaWorkMode(params: {
  tenantId: string;
  userId?: string | null;
  dependencies?: TenantDoctorDependencies;
}): Promise<TenantBetaWorkMode> {
  const report = await runTenantDoctor({
    tenantId: params.tenantId,
    userId: params.userId || null,
    autoFix: true,
    dependencies: params.dependencies,
  });
  const supabase = params.dependencies?.supabase || (await import("@/lib/supabase/admin")).supabaseAdmin;
  const workQueue = buildTenantBetaWorkQueue(report);
  const trace = await registerTenantBetaWorkMode({
    tenantId: params.tenantId,
    userId: params.userId || null,
    report,
    workQueue,
    supabase,
  });

  return {
    report,
    taskId: trace.taskId,
    artifactId: trace.artifactId,
    readinessScore: report.readinessScore,
    readinessLevel: report.readinessLevel,
    workQueue: trace.workQueue,
  };
}

export async function executeNextTenantBetaStep(params: {
  tenantId: string;
  userId?: string | null;
  taskId?: string | null;
  dependencies?: Pick<TenantDoctorDependencies, "supabase">;
}): Promise<TenantBetaStepExecution | null> {
  const supabase = params.dependencies?.supabase || (await import("@/lib/supabase/admin")).supabaseAdmin;
  const now = new Date().toISOString();
  let taskId = typeof params.taskId === "string" && params.taskId.trim() ? params.taskId.trim() : null;

  if (!taskId) {
    const { data: latestArtifact, error: artifactError } = await supabase
      .from("brain_artifacts")
      .select("task_id")
      .eq("tenant_id", params.tenantId)
      .eq("artifact_type", "tenant_beta_workplan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (artifactError) throw artifactError;
    taskId = typeof latestArtifact?.task_id === "string" ? latestArtifact.task_id : null;
  }

  if (!taskId) return null;

  const { data: step, error: stepError } = await supabase
    .from("brain_steps")
    .select("id, task_id, run_id, step_key, title, status, output_payload")
    .eq("tenant_id", params.tenantId)
    .eq("task_id", taskId)
    .eq("status", "queued")
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stepError) throw stepError;
  if (!step?.id) return null;

  const metadata = buildTenantBetaStepMetadata({
    step_key: String(step.step_key || ""),
    title: String(step.title || "Etapa beta"),
    output_payload: step.output_payload,
  });

  const { error: executingError } = await supabase
    .from("brain_steps")
    .update({
      status: "executing",
      started_at: now,
      output_payload: {
        ...(step.output_payload || {}),
        beta_execution_started_at: now,
        external_side_effects_blocked: true,
      },
    })
    .eq("id", step.id)
    .eq("tenant_id", params.tenantId);

  if (executingError) throw executingError;

  const handlerMetadata: Record<string, any> = await runTenantBetaStepHandler({
    tenantId: params.tenantId,
    userId: params.userId || null,
    taskId,
    runId: step.run_id || null,
    stepId: step.id,
    stepKey: String(step.step_key || ""),
    supabase,
  });
  const completedAt = new Date().toISOString();
  const { error: completedError } = await supabase
    .from("brain_steps")
    .update({
      status: "completed",
      output_payload: {
        ...(step.output_payload || {}),
        ...metadata,
        ...handlerMetadata,
        beta_execution_started_at: now,
        beta_execution_completed_at: completedAt,
      },
      completed_at: completedAt,
    })
    .eq("id", step.id)
    .eq("tenant_id", params.tenantId);

  if (completedError) throw completedError;

  const { data: artifact, error: artifactInsertError } = await supabase
    .from("brain_artifacts")
    .insert({
      tenant_id: params.tenantId,
      task_id: taskId,
      run_id: step.run_id || null,
      step_id: step.id,
      artifact_type: "tenant_beta_step_result",
      title: `Beta - ${step.title || step.step_key}`,
      mime_type: "application/json",
      source_module: "setup",
      metadata,
    })
    .select("id")
    .single();

  if (artifactInsertError) throw artifactInsertError;

  const { error: learningError } = await supabase.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: taskId,
    run_id: step.run_id || null,
    step_id: step.id,
    event_type: "tenant_beta_step_completed",
    source_module: "setup",
      payload: {
        ...metadata,
        ...handlerMetadata,
        artifact_id: artifact?.id || null,
      },
    created_by: params.userId || null,
  });

  if (learningError) throw learningError;

  const { data: remainingSteps, error: remainingStepsError } = await supabase
    .from("brain_steps")
    .select("id,status")
    .eq("tenant_id", params.tenantId)
    .eq("task_id", taskId);

  if (remainingStepsError) throw remainingStepsError;

  const remainingQueued = (remainingSteps || []).filter((item: any) => item.status === "queued").length;
  const remainingAwaitingApproval = (remainingSteps || []).filter((item: any) => item.status === "awaiting_approval").length;
  const taskStatus = remainingQueued > 0
    ? "executing" as const
    : remainingAwaitingApproval > 0
      ? "awaiting_approval" as const
      : "completed" as const;
  const statusSummary = taskStatus === "completed"
    ? "Modo Beta concluiu todos os itens seguros da fila."
    : taskStatus === "awaiting_approval"
      ? `Modo Beta concluiu itens seguros e aguarda ${remainingAwaitingApproval} aprovacao(oes).`
      : metadata.summary;
  const completedTaskAt = taskStatus === "completed" ? completedAt : null;

  await supabase
    .from("brain_tasks")
    .update({
      status: taskStatus,
      result_summary: statusSummary,
      ...(completedTaskAt ? { completed_at: completedTaskAt } : {}),
      updated_at: completedAt,
    })
    .eq("id", taskId)
    .eq("tenant_id", params.tenantId);

  await supabase
    .from("brain_runs")
    .update({
      status: taskStatus,
      summary: statusSummary,
      ...(completedTaskAt ? { completed_at: completedTaskAt } : {}),
    })
    .eq("id", step.run_id || "")
    .eq("tenant_id", params.tenantId);

  return {
    taskId,
    stepId: String(step.id),
    stepKey: String(step.step_key || ""),
    title: String(step.title || "Etapa beta"),
    status: "completed",
    taskStatus,
    remainingQueued,
    remainingAwaitingApproval,
    artifactId: artifact?.id ? String(artifact.id) : null,
    summary: typeof handlerMetadata.beta_handler_summary === "string"
      ? handlerMetadata.beta_handler_summary
      : typeof handlerMetadata.daily_playbook_summary === "string"
        ? handlerMetadata.daily_playbook_summary
        : metadata.summary,
  };
}

export async function executeTenantBetaSafeQueue(params: {
  tenantId: string;
  userId?: string | null;
  taskId?: string | null;
  maxSteps?: number;
  dependencies?: Pick<TenantDoctorDependencies, "supabase">;
}): Promise<TenantBetaRunSafeQueueResult> {
  const maxSteps = Math.max(1, Math.min(Number(params.maxSteps || 10), 20));
  const executions: TenantBetaStepExecution[] = [];
  let taskId = params.taskId || null;

  for (let index = 0; index < maxSteps; index += 1) {
    const execution = await executeNextTenantBetaStep({
      tenantId: params.tenantId,
      userId: params.userId || null,
      taskId,
      dependencies: params.dependencies,
    });

    if (!execution) break;
    executions.push(execution);
    taskId = execution.taskId;

    if (execution.taskStatus !== "executing") break;
  }

  const finalStatus = executions.at(-1)?.taskStatus || "idle";
  const summary = executions.length === 0
    ? "Nenhum item seguro em fila para executar."
    : finalStatus === "completed"
      ? `MAYUS executou ${executions.length} item(ns) seguro(s) e concluiu a fila beta.`
      : finalStatus === "awaiting_approval"
        ? `MAYUS executou ${executions.length} item(ns) seguro(s) e parou em aprovacao humana.`
        : `MAYUS executou ${executions.length} item(ns) seguro(s); ainda ha fila segura restante.`;

  return {
    taskId,
    executions,
    finalStatus,
    summary,
  };
}
