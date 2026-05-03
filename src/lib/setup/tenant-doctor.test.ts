import { beforeAll, describe, expect, it } from "vitest";
import {
  buildTenantBetaWorkQueue,
  buildIntegrationDoctorChecks,
  buildTenantDoctorReadiness,
  executeNextTenantBetaStep,
  executeTenantBetaSafeQueue,
  buildTenantDoctorArtifactMetadata,
  runTenantDoctor,
  startTenantBetaWorkMode,
  summarizeTenantDoctorChecks,
  type TenantDoctorCheck,
} from "./tenant-doctor";

describe("tenant doctor", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
  });

  it("marks integrations with secure credentials as ok", () => {
    const checks = buildIntegrationDoctorChecks({
      googleDriveConfigured: true,
      integrations: [
        { provider: "openrouter", status: "connected", has_api_key: false },
        { provider: "openai", status: "disconnected", has_api_key: true },
        { provider: "google_drive", status: "connected", has_webhook_secret: true },
      ],
    });

    expect(checks.find((item) => item.id === "integration:openrouter")?.status).toBe("ok");
    expect(checks.find((item) => item.id === "integration:openai")?.status).toBe("ok");
    expect(checks.find((item) => item.id === "integration:google_drive")?.status).toBe("ok");
  });

  it("blocks Google Drive when OAuth env is invalid even if the tenant row exists", () => {
    const checks = buildIntegrationDoctorChecks({
      googleDriveConfigured: false,
      integrations: [
        { provider: "google_drive", status: "connected", has_api_key: true },
      ],
    });

    const googleDrive = checks.find((item) => item.id === "integration:google_drive:env");

    expect(googleDrive?.status).toBe("blocked");
    expect(googleDrive?.autoFixable).toBe(false);
    expect(googleDrive?.nextAction).toContain("client ID e credencial OAuth");
  });

  it("summarizes checks and keeps blocked items visible", () => {
    const checks: TenantDoctorCheck[] = [
      { id: "a", category: "tenant", status: "ok", title: "A", detail: "A", autoFixable: false },
      { id: "b", category: "crm", status: "fixed", title: "B", detail: "B", autoFixable: true, fixed: true },
      { id: "c", category: "integrations", status: "blocked", title: "C", detail: "C", autoFixable: false },
      { id: "d", category: "skills", status: "warning", title: "D", detail: "D", autoFixable: true },
    ];

    expect(summarizeTenantDoctorChecks(checks)).toEqual({
      ok: 1,
      fixed: 1,
      blocked: 1,
      warning: 1,
    });
  });

  it("calculates readiness and selects the first actionable setup step", () => {
    const readiness = buildTenantDoctorReadiness([
      { id: "tenant:record", category: "tenant", status: "ok", title: "Tenant encontrado", detail: "Tenant acessivel.", autoFixable: false },
      {
        id: "integration:google_drive:env",
        category: "integrations",
        status: "blocked",
        title: "Google Drive sem OAuth valido",
        detail: "OAuth ausente.",
        autoFixable: false,
        nextAction: "Configurar OAuth Google Drive.",
      },
      { id: "commercial:sales_profile", category: "commercial", status: "warning", title: "Perfil comercial incompleto", detail: "Falta PUV.", autoFixable: false },
    ]);

    expect(readiness.level).toBe("blocked");
    expect(readiness.score).toBeLessThan(60);
    expect(readiness.recommendedAction.sourceCheckId).toBe("integration:google_drive:env");
    expect(readiness.recommendedAction.action).toBe("Configurar OAuth Google Drive.");
    expect(readiness.recommendedAction.requiresHumanAction).toBe(true);
  });

  it("builds a safe artifact payload without credentials", () => {
    const metadata = buildTenantDoctorArtifactMetadata({
      tenantId: "tenant-1",
      ready: false,
      autoFixApplied: true,
      readinessScore: 67,
      readinessLevel: "blocked",
      recommendedAction: {
        id: "next:integration:openrouter",
        category: "integrations",
        title: "Remover bloqueio principal",
        detail: "Integracao openrouter pendente.",
        action: "Cadastrar credencial pelo painel de integracoes.",
        sourceCheckId: "integration:openrouter",
        requiresHumanAction: true,
      },
      summary: { ok: 1, fixed: 1, warning: 0, blocked: 1 },
      checks: [
        { id: "tenant:record", category: "tenant", status: "ok", title: "Tenant encontrado", detail: "Tenant acessivel.", autoFixable: false },
        { id: "crm:pipeline", category: "crm", status: "fixed", title: "Pipeline criado", detail: "Pipeline Comercial criado automaticamente.", autoFixable: true, fixed: true },
        {
          id: "integration:openrouter",
          category: "integrations",
          status: "blocked",
          title: "Integracao openrouter pendente",
          detail: "Nao ha credencial segura ou conexao ativa para este provider.",
          autoFixable: false,
          nextAction: "Cadastrar credencial pelo painel de integracoes ou fluxo OAuth correspondente.",
        },
      ],
    });

    expect(metadata.fixed_count).toBe(1);
    expect(metadata.blocked_count).toBe(1);
    expect(metadata.readiness_score).toBe(67);
    expect(metadata.recommended_action.sourceCheckId).toBe("integration:openrouter");
    expect(metadata.requires_human_action).toBe(true);
    expect(JSON.stringify(metadata)).not.toMatch(/api_key|webhook_secret|sk-/i);
  });

  it("warns when the commercial sales profile is incomplete", async () => {
    const supabase = {
      from(table: string) {
        const builder: any = {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          maybeSingle() {
            if (table === "tenants") {
              return Promise.resolve({ data: { id: "tenant-1", name: "Dutra", status: "active" }, error: null });
            }
            if (table === "tenant_settings") {
              return Promise.resolve({ data: { ai_features: {} }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then(resolve: (value: any) => void) {
            const rows: Record<string, any[]> = {
              crm_pipelines: [{ id: "pipeline-1", name: "Comercial" }],
              crm_stages: [{ id: "stage-1", name: "Novo Lead" }],
              agent_skills: [{ id: "skill-1", name: "sales_consultation", is_active: true }],
            };
            resolve({ data: rows[table] || null, error: null });
          },
          insert() { return this; },
          single() { return Promise.resolve({ data: { id: `${table}-1` }, error: null }); },
        };
        return builder;
      },
    };

    const connectedIntegrations = ["openrouter", "openai", "google_drive", "zapsign", "asaas", "escavador", "elevenlabs"]
      .map((provider) => ({ provider, status: "connected", has_api_key: true }));

    const report = await runTenantDoctor({
      tenantId: "tenant-1",
      autoFix: false,
      dependencies: {
        supabase,
        ensureDefaultSkills: async () => null,
        googleDriveConfigured: () => true,
        listIntegrations: async () => connectedIntegrations,
      },
    });

    const commercial = report.checks.find((item) => item.id === "commercial:sales_profile");
    expect(commercial?.status).toBe("warning");
    expect(commercial?.nextAction).toContain("cliente ideal");
  });

  it("builds a supervised beta work queue from setup readiness", () => {
    const workQueue = buildTenantBetaWorkQueue({
      tenantId: "tenant-1",
      ready: false,
      autoFixApplied: true,
      readinessScore: 54,
      readinessLevel: "blocked",
      recommendedAction: {
        id: "next:integration:google_drive:env",
        category: "integrations",
        title: "Remover bloqueio principal",
        detail: "Google Drive sem OAuth valido.",
        action: "Configurar OAuth Google Drive.",
        sourceCheckId: "integration:google_drive:env",
        requiresHumanAction: true,
      },
      summary: { ok: 2, fixed: 1, warning: 0, blocked: 1 },
      checks: [],
      brainTrace: null,
    });

    expect(workQueue[0]).toEqual(expect.objectContaining({
      id: "setup:next_best_action",
      priority: "high",
      requiresApproval: true,
    }));
    expect(workQueue.map((item) => item.id)).toContain("growth:crm_next_steps");
    expect(JSON.stringify(workQueue)).not.toMatch(/api_key|webhook_secret|sk-/i);
  });

  it("registers a brain mission, artifact and learning event for POST autofix results", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase = {
      from(table: string) {
        const builder: any = {
          payload: undefined,
          insert(payload: any) {
            inserts.push({ table, payload });
            this.payload = payload;
            return this;
          },
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          maybeSingle() {
            if (table === "tenants") {
              return Promise.resolve({ data: { id: "tenant-1", name: "Dutra", status: "active" }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            const ids: Record<string, string> = {
              crm_pipelines: "pipeline-1",
              brain_tasks: "task-1",
              brain_runs: "run-1",
              brain_steps: "step-1",
              brain_artifacts: "artifact-1",
            };
            return Promise.resolve({ data: { id: ids[table] || `${table}-1` }, error: null });
          },
          then(resolve: (value: any) => void) {
            const rows: Record<string, any[]> = {
              crm_pipelines: [],
              crm_stages: [],
              agent_skills: [{ id: "skill-1", name: "support_case_status", is_active: true }],
            };
            resolve({ data: rows[table] || null, error: null });
          },
        };
        return builder;
      },
    };

    const report = await runTenantDoctor({
      tenantId: "tenant-1",
      userId: "user-1",
      autoFix: true,
      dependencies: {
        supabase,
        ensureDefaultSkills: async () => null,
        googleDriveConfigured: () => false,
        listIntegrations: async () => [],
      },
    });

    expect(report.brainTrace).toEqual({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      artifactId: "artifact-1",
      eventType: "tenant_setup_doctor_report_created",
    });
    expect(inserts.some((item) => item.table === "brain_tasks")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_runs")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_steps")).toBe(true);
    const artifactInsert = inserts.find((item) => item.table === "brain_artifacts");
    expect(artifactInsert?.payload.artifact_type).toBe("tenant_setup_doctor_report");
    expect(artifactInsert?.payload.metadata.blocked_count).toBeGreaterThan(0);
    expect(JSON.stringify(artifactInsert?.payload.metadata)).not.toMatch(/api_key|webhook_secret|sk-/i);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "tenant_setup_doctor_report_created")).toBe(true);
  });

  it("starts beta mode with queued steps and approval checkpoints", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    let brainStepCounter = 0;
    const supabase = {
      from(table: string) {
        const builder: any = {
          payload: undefined,
          insert(payload: any) {
            inserts.push({ table, payload });
            this.payload = payload;
            return this;
          },
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          maybeSingle() {
            if (table === "tenants") {
              return Promise.resolve({ data: { id: "tenant-1", name: "Dutra", status: "active" }, error: null });
            }
            if (table === "tenant_settings") {
              return Promise.resolve({ data: { ai_features: {} }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            const ids: Record<string, string> = {
              crm_pipelines: "pipeline-1",
              brain_tasks: inserts.filter((item) => item.table === "brain_tasks").length === 1 ? "doctor-task-1" : "beta-task-1",
              brain_runs: inserts.filter((item) => item.table === "brain_runs").length === 1 ? "doctor-run-1" : "beta-run-1",
              brain_steps: `step-${++brainStepCounter}`,
              brain_artifacts: inserts.filter((item) => item.table === "brain_artifacts").length === 1 ? "doctor-artifact-1" : "beta-artifact-1",
            };
            return Promise.resolve({ data: { id: ids[table] || `${table}-1` }, error: null });
          },
          then(resolve: (value: any) => void) {
            if (table === "brain_steps" && Array.isArray(this.payload)) {
              resolve({
                data: this.payload.map((item: any, index: number) => ({
                  id: `queue-step-${index + 1}`,
                  step_key: item.step_key,
                })),
                error: null,
              });
              return;
            }
            const rows: Record<string, any[]> = {
              crm_pipelines: [],
              crm_stages: [],
              agent_skills: [{ id: "skill-1", name: "support_case_status", is_active: true }],
            };
            resolve({ data: rows[table] || null, error: null });
          },
        };
        return builder;
      },
    };

    const beta = await startTenantBetaWorkMode({
      tenantId: "tenant-1",
      userId: "user-1",
      dependencies: {
        supabase,
        ensureDefaultSkills: async () => null,
        googleDriveConfigured: () => false,
        listIntegrations: async () => [],
      },
    });

    expect(beta.taskId).toBe("beta-task-1");
    expect(beta.workQueue.some((item) => item.status === "queued")).toBe(true);
    expect(beta.workQueue.some((item) => item.status === "awaiting_approval")).toBe(true);
    expect(beta.workQueue.every((item) => typeof item.stepId === "string")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_approvals")).toBe(true);
    const betaTask = inserts.filter((item) => item.table === "brain_tasks").at(-1)?.payload;
    expect(betaTask.status).toBe("executing");
    const betaArtifact = inserts.filter((item) => item.table === "brain_artifacts").at(-1)?.payload;
    expect(betaArtifact.artifact_type).toBe("tenant_beta_workplan");
    expect(betaArtifact.metadata.work_queue.some((item: any) => item.status === "queued")).toBe(true);
  });

  it("executes the next queued beta step and records artifact and learning event", async () => {
    const updates: Array<{ table: string; payload: any }> = [];
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase = {
      from(table: string) {
        const builder: any = {
          payload: undefined,
          insert(payload: any) {
            inserts.push({ table, payload });
            this.payload = payload;
            return this;
          },
          update(payload: any) {
            updates.push({ table, payload });
            this.payload = payload;
            return this;
          },
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle() {
            if (table === "brain_steps") {
              return Promise.resolve({
                data: {
                  id: "queue-step-1",
                  task_id: "beta-task-1",
                  run_id: "beta-run-1",
                  step_key: "core:daily_playbook",
                  title: "Gerar Playbook Diario MAYUS",
                  status: "queued",
                  output_payload: { detail: "Criar resumo executivo." },
                },
                error: null,
              });
            }
            if (table === "brain_artifacts") {
              return Promise.resolve({ data: { task_id: "beta-task-1" }, error: null });
            }
            if (table === "tenant_settings") {
              return Promise.resolve({ data: { ai_features: { firm_name: "Dutra" } }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            if (table === "brain_artifacts") {
              const artifactCount = inserts.filter((item) => item.table === "brain_artifacts").length;
              return Promise.resolve({ data: { id: artifactCount === 1 ? "daily-playbook-artifact-1" : "step-artifact-1" }, error: null });
            }
            return Promise.resolve({ data: { id: `${table}-1` }, error: null });
          },
          then(resolve: (value: any) => void) {
            const rows: Record<string, any[]> = {
              brain_steps: [
                { id: "queue-step-1", status: "completed" },
                { id: "queue-step-2", status: "queued" },
                { id: "queue-step-3", status: "awaiting_approval" },
              ],
              crm_pipelines: [],
              user_tasks: [],
            };
            resolve({ data: rows[table] || null, error: null });
          },
        };
        return builder;
      },
    };

    const execution = await executeNextTenantBetaStep({
      tenantId: "tenant-1",
      userId: "user-1",
      taskId: "beta-task-1",
      dependencies: { supabase },
    });

    expect(execution).toEqual(expect.objectContaining({
      taskId: "beta-task-1",
      stepId: "queue-step-1",
      stepKey: "core:daily_playbook",
      status: "completed",
      taskStatus: "executing",
      artifactId: "step-artifact-1",
    }));
    expect(updates.some((item) => item.table === "brain_steps" && item.payload.status === "executing")).toBe(true);
    expect(updates.some((item) => item.table === "brain_steps" && item.payload.status === "completed")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "tenant_beta_step_result")).toBe(true);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "tenant_beta_step_completed")).toBe(true);
    expect(updates.some((item) => item.table === "brain_tasks" && item.payload.status === "executing")).toBe(true);
  });

  it("executes the CRM next-step beta handler with a Growth artifact", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase = {
      from(table: string) {
        const builder: any = {
          payload: undefined,
          insert(payload: any) {
            inserts.push({ table, payload });
            this.payload = payload;
            return this;
          },
          update(payload: any) {
            this.payload = payload;
            return this;
          },
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle() {
            if (table === "brain_steps") {
              return Promise.resolve({
                data: {
                  id: "queue-step-crm",
                  task_id: "beta-task-1",
                  run_id: "beta-run-1",
                  step_key: "growth:crm_next_steps",
                  title: "Organizar leads sem proximo passo",
                  status: "queued",
                  output_payload: { detail: "Identificar oportunidades abertas." },
                },
                error: null,
              });
            }
            if (table === "tenant_settings") {
              return Promise.resolve({ data: { ai_features: {} }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            if (table === "brain_artifacts") {
              const count = inserts.filter((item) => item.table === "brain_artifacts").length;
              return Promise.resolve({ data: { id: count === 1 ? "crm-artifact-1" : "step-artifact-1" }, error: null });
            }
            return Promise.resolve({ data: { id: `${table}-1` }, error: null });
          },
          then(resolve: (value: any) => void) {
            const rows: Record<string, any[]> = {
              brain_steps: [
                { id: "queue-step-crm", status: "completed" },
              ],
              crm_pipelines: [{ id: "pipeline-1" }],
              crm_stages: [{ id: "stage-1", name: "Novo Lead", is_win: false, is_loss: false }],
              crm_tasks: [{
                id: "lead-1",
                title: "Maria Previdenciario",
                description: "Cliente quer entender revisao de beneficio.",
                tags: [],
                sector: "Previdenciario",
                stage_id: "stage-1",
                phone: "11999999999",
                created_at: "2026-05-01T10:00:00.000Z",
                data_ultima_movimentacao: "2026-05-01T10:00:00.000Z",
              }],
            };
            resolve({ data: rows[table] || null, error: null });
          },
        };
        return builder;
      },
    };

    const execution = await executeNextTenantBetaStep({
      tenantId: "tenant-1",
      userId: "user-1",
      taskId: "beta-task-1",
      dependencies: { supabase },
    });

    expect(execution?.summary).toContain("Growth por chat identificou 1 lead");
    expect(execution?.taskStatus).toBe("completed");
    const growthArtifact = inserts.find((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "marketing_ops_assistant_plan");
    expect(growthArtifact?.payload.metadata.leads_needing_next_step_count).toBe(1);
    expect(growthArtifact?.payload.metadata.external_side_effects_blocked).toBe(true);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.payload?.handled_capability === "growth_crm_next_steps")).toBe(true);
  });

  it("executes the support case status beta handler with a Lex artifact", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase = {
      from(table: string) {
        const builder: any = {
          payload: undefined,
          insert(payload: any) {
            inserts.push({ table, payload });
            this.payload = payload;
            return this;
          },
          update(payload: any) {
            this.payload = payload;
            return this;
          },
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle() {
            if (table === "brain_steps") {
              return Promise.resolve({
                data: {
                  id: "queue-step-lex",
                  task_id: "beta-task-1",
                  run_id: "beta-run-1",
                  step_key: "lex:support_case_status",
                  title: "Responder status de caso com base confirmada",
                  status: "queued",
                  output_payload: { detail: "Usar andamento seguro." },
                },
                error: null,
              });
            }
            if (table === "process_tasks") {
              return Promise.resolve({
                data: {
                  id: "process-1",
                  pipeline_id: "pipeline-1",
                  stage_id: "stage-1",
                  title: "Revisional Maria",
                  client_name: "Maria",
                  process_number: "0000001-00.2026.8.26.0100",
                  demanda: "Bancario",
                  description: "Aguardando documentos finais.",
                  created_at: "2026-05-01T10:00:00.000Z",
                },
                error: null,
              });
            }
            if (table === "process_document_memory") {
              return Promise.resolve({
                data: {
                  summary_master: "Caso em fase de analise documental.",
                  missing_documents: ["contrato bancario"],
                  current_phase: "Analise documental",
                  document_count: 3,
                  sync_status: "synced",
                  last_synced_at: "2026-05-02T10:00:00.000Z",
                  case_brain_task_id: "case-brain-1",
                },
                error: null,
              });
            }
            if (table === "process_stages") return Promise.resolve({ data: { id: "stage-1", name: "Em analise" }, error: null });
            if (table === "process_pipelines") return Promise.resolve({ data: { id: "pipeline-1", name: "Juridico" }, error: null });
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            if (table === "brain_artifacts") {
              const count = inserts.filter((item) => item.table === "brain_artifacts").length;
              return Promise.resolve({ data: { id: count === 1 ? "support-artifact-1" : "step-artifact-1" }, error: null });
            }
            return Promise.resolve({ data: { id: `${table}-1` }, error: null });
          },
          then(resolve: (value: any) => void) {
            const rows: Record<string, any[]> = {
              brain_steps: [{ id: "queue-step-lex", status: "completed" }],
            };
            resolve({ data: rows[table] || null, error: null });
          },
        };
        return builder;
      },
    };

    const execution = await executeNextTenantBetaStep({
      tenantId: "tenant-1",
      userId: "user-1",
      taskId: "beta-task-1",
      dependencies: { supabase },
    });

    expect(execution?.summary).toContain("Status do caso");
    const supportArtifact = inserts.find((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "support_case_status");
    expect(supportArtifact?.payload.metadata.support_status_response_mode).toBe("answer");
    expect(supportArtifact?.payload.metadata.support_status_confidence).toBe("high");
    expect(supportArtifact?.payload.metadata.external_side_effects_blocked).toBe(true);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.payload?.handled_capability === "lex_support_case_status")).toBe(true);
  });

  it("executes safe beta queue until approval or completion", async () => {
    let callCount = 0;
    const supabase = {
      from(table: string) {
        const builder: any = {
          payload: undefined,
          insert(payload: any) { this.payload = payload; return this; },
          update(payload: any) { this.payload = payload; return this; },
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          maybeSingle() {
            if (table === "brain_steps") {
              callCount += 1;
              return Promise.resolve({
                data: {
                  id: `queue-step-${callCount}`,
                  task_id: "beta-task-1",
                  run_id: "beta-run-1",
                  step_key: callCount === 1 ? "growth:crm_next_steps" : "lex:support_case_status",
                  title: callCount === 1 ? "Organizar leads sem proximo passo" : "Responder status de caso",
                  status: "queued",
                  output_payload: {},
                },
                error: null,
              });
            }
            if (table === "tenant_settings") return Promise.resolve({ data: { ai_features: {} }, error: null });
            if (table === "process_tasks") {
              return Promise.resolve({
                data: {
                  id: "process-1",
                  pipeline_id: null,
                  stage_id: null,
                  title: "Caso beta",
                  client_name: "Cliente",
                  process_number: null,
                  demanda: "Civel",
                  description: "Caso em acompanhamento.",
                  created_at: "2026-05-01T10:00:00.000Z",
                },
                error: null,
              });
            }
            if (table === "process_document_memory") {
              return Promise.resolve({ data: { summary_master: "Resumo do caso.", current_phase: "Analise", document_count: 1, missing_documents: [] }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            return Promise.resolve({ data: { id: `${table}-${callCount || 1}` }, error: null });
          },
          then(resolve: (value: any) => void) {
            const rows: Record<string, any[]> = {
              crm_pipelines: [],
              user_tasks: [],
              brain_steps: callCount === 1
                ? [{ id: "queue-step-1", status: "completed" }, { id: "queue-step-2", status: "queued" }]
                : [{ id: "queue-step-1", status: "completed" }, { id: "queue-step-2", status: "completed" }],
            };
            resolve({ data: rows[table] || null, error: null });
          },
        };
        return builder;
      },
    };

    const result = await executeTenantBetaSafeQueue({
      tenantId: "tenant-1",
      userId: "user-1",
      taskId: "beta-task-1",
      maxSteps: 5,
      dependencies: { supabase },
    });

    expect(result.executions).toHaveLength(2);
    expect(result.finalStatus).toBe("completed");
    expect(result.summary).toContain("concluiu a fila beta");
  });
});
