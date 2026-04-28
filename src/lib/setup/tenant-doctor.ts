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

export type TenantDoctorReport = {
  tenantId: string;
  ready: boolean;
  autoFixApplied: boolean;
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
  const report = {
    tenantId: params.tenantId,
    ready: summary.blocked === 0 && summary.warning === 0,
    autoFixApplied: autoFix,
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
