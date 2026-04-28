import { describe, expect, it } from "vitest";
import {
  buildIntegrationDoctorChecks,
  buildTenantDoctorArtifactMetadata,
  runTenantDoctor,
  summarizeTenantDoctorChecks,
  type TenantDoctorCheck,
} from "./tenant-doctor";

describe("tenant doctor", () => {
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

  it("builds a safe artifact payload without credentials", () => {
    const metadata = buildTenantDoctorArtifactMetadata({
      tenantId: "tenant-1",
      ready: false,
      autoFixApplied: true,
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
});
