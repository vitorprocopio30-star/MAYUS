import { describe, expect, it } from "vitest";
import {
  analyzeLeadIntake,
  buildCrmTaskPayload,
  buildLeadIntakeEventPayload,
  buildReferralIntakeArtifactMetadata,
  registerReferralIntakeBrainArtifact,
} from "./lead-intake";

describe("lead intake", () => {
  it("scores urgent leads higher and recommends human follow-up", () => {
    const result = analyzeLeadIntake({
      name: "Maria Silva",
      phone: "(21) 99999-0000",
      origin: "Instagram",
      channel: "WhatsApp",
      legalArea: "Trabalhista",
      urgency: "alta",
      pain: "Tenho uma audiencia amanha e preciso de apoio urgente para defesa.",
    });

    expect(result.kind).toBe("new_lead");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.tags).toContain("urgente");
    expect(result.needsHumanHandoff).toBe(true);
  });

  it("keeps incomplete leads as needs_context", () => {
    const result = analyzeLeadIntake({
      name: "Joao",
      pain: "Preciso de ajuda",
    });

    expect(result.kind).toBe("needs_context");
    expect(result.score).toBeLessThanOrEqual(55);
    expect(result.tags).toContain("precisa-contexto");
    expect(result.nextStep).toContain("Coletar telefone");
  });

  it("does not classify case status requests as commercial leads", () => {
    const result = analyzeLeadIntake({
      name: "Cliente Atual",
      phone: "21999990000",
      pain: "Quero saber o andamento do meu processo e se houve movimentacao.",
    });

    expect(result.kind).toBe("case_status_request");
    expect(result.tags).toContain("status-caso");
    expect(result.nextStep).toContain("status do caso");
  });

  it("classifies referrals separately and preserves referrer context", () => {
    const result = analyzeLeadIntake({
      name: "Carlos Indicado",
      phone: "21977776666",
      origin: "Indicacao",
      channel: "WhatsApp",
      legalArea: "Previdenciario",
      pain: "Foi indicado pela cliente Ana para revisar negativa do INSS.",
      referredBy: "Ana Cliente",
      referralRelationship: "cliente ativa do escritorio",
    });

    expect(result.kind).toBe("referral");
    expect(result.tags).toContain("indicacao");
    expect(result.tags).toContain("indicado-por:ana cliente");
    expect(result.nextStep).toContain("confirmar consentimento");
    expect(result.description).toContain("Indicado por: Ana Cliente");
    expect(result.description).toContain("Relacionamento com indicador: cliente ativa do escritorio");
  });

  it("keeps referral-like status requests routed to case support", () => {
    const result = analyzeLeadIntake({
      name: "Cliente Atual",
      phone: "21999990000",
      origin: "Indicacao",
      pain: "Fui indicado, mas quero saber o andamento do meu processo.",
    });

    expect(result.kind).toBe("case_status_request");
    expect(result.tags).toContain("status-caso");
    expect(result.tags).not.toContain("indicacao");
  });

  it("builds a crm task payload with score, source and tags", () => {
    const result = analyzeLeadIntake({
      name: "Ana Lead",
      phone: "21988887777",
      origin: "Google Ads",
      channel: "Formulario",
      legalArea: "Previdenciario",
      pain: "Preciso revisar negativa do INSS e entender documentos para acao.",
    });

    const payload = buildCrmTaskPayload({
      tenantId: "tenant-1",
      pipelineId: "pipeline-1",
      stageId: "stage-1",
      result,
    });

    expect(payload.title).toBe("Ana Lead");
    expect(payload.lead_scoring).toBe(result.score);
    expect(payload.source).toBe("Google Ads");
    expect(payload.tags).toContain("lead-intake");
    expect(payload.tags).toContain("canal:formulario");
  });

  it("preserves marketing attribution for campaign and UTM leads", () => {
    const result = analyzeLeadIntake({
      name: "Lead Meta",
      phone: "21988887777",
      utm_source: "Meta Ads",
      utm_medium: "Paid Social",
      utm_campaign: "Familia Abril",
      utm_content: "criativo-01",
      content_title: "Guia de guarda compartilhada",
      legalArea: "Familia",
      pain: "Preciso revisar acordo de guarda e entender os proximos passos.",
    });

    const payload = buildCrmTaskPayload({
      tenantId: "tenant-1",
      pipelineId: "pipeline-1",
      stageId: "stage-1",
      result,
    });
    const eventPayload = buildLeadIntakeEventPayload({ crmTaskId: "crm-task-1", result });

    expect(payload.source).toBe("Meta Ads");
    expect(payload.tags).toContain("marketing-attribution");
    expect(payload.tags).toContain("campanha:familia-abril");
    expect(payload.description).toContain("Atribuicao de marketing:");
    expect(payload.description).toContain("UTM campaign: Familia Abril");
    expect(eventPayload).toEqual(expect.objectContaining({
      origin: "Meta Ads",
      channel: "Paid Social",
      campaign: "Familia Abril",
      content_id: "criativo-01",
      content_title: "Guia de guarda compartilhada",
      has_marketing_attribution: true,
    }));
  });

  it("keeps growth_intake as technical source when marketing attribution is missing", () => {
    const result = analyzeLeadIntake({
      name: "Lead Organico",
      phone: "21988887777",
      legalArea: "Consumidor",
      pain: "Preciso resolver uma cobranca indevida com bastante urgencia.",
    });

    const payload = buildCrmTaskPayload({
      tenantId: "tenant-1",
      pipelineId: "pipeline-1",
      stageId: "stage-1",
      result,
    });

    expect(payload.source).toBe("growth_intake");
    expect(payload.tags).toContain("sem-atribuicao-marketing");
    expect(payload.description).toContain("sem origem/campanha rastreada");
  });

  it("builds referral crm payload with referral source and relationship details", () => {
    const result = analyzeLeadIntake({
      name: "Bianca Indicada",
      phone: "21966665555",
      legalArea: "Familia",
      pain: "Indicada por um cliente para avaliar revisao de alimentos.",
      referredBy: "Pedro Cliente",
      referralRelationship: "amigo da familia",
    });

    const payload = buildCrmTaskPayload({
      tenantId: "tenant-1",
      pipelineId: "pipeline-1",
      stageId: "stage-1",
      result,
    });

    expect(payload.source).toBe("indicacao");
    expect(payload.tags).toContain("indicacao");
    expect(payload.description).toContain("Indicado por: Pedro Cliente");
  });

  it("builds audit event payload for referral intake", () => {
    const result = analyzeLeadIntake({
      name: "Bianca Indicada",
      phone: "21966665555",
      legalArea: "Familia",
      pain: "Indicada por um cliente para avaliar revisao de alimentos.",
      referredBy: "Pedro Cliente",
      referralRelationship: "amigo da familia",
    });

    const payload = buildLeadIntakeEventPayload({
      crmTaskId: "crm-task-1",
      result,
    });

    expect(payload).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      kind: "referral",
      origin: "indicacao",
      referred_by: "Pedro Cliente",
      referral_relationship: "amigo da familia",
      needs_human_handoff: true,
    }));
  });

  it("builds a referral artifact payload without contact secrets", () => {
    const result = analyzeLeadIntake({
      name: "Bianca Indicada",
      phone: "21966665555",
      email: "bianca@example.com",
      legalArea: "Familia",
      pain: "Indicada por um cliente para avaliar revisao de alimentos.",
      referredBy: "Pedro Cliente",
      referralRelationship: "amigo da familia",
    });

    const metadata = buildReferralIntakeArtifactMetadata({
      crmTaskId: "crm-task-1",
      result,
    });

    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      kind: "referral",
      score: result.score,
      phone_present: true,
      email_present: true,
      referred_by: "Pedro Cliente",
      requires_human_action: true,
    }));
    expect(JSON.stringify(metadata)).not.toContain("21966665555");
    expect(JSON.stringify(metadata)).not.toContain("bianca@example.com");
    expect(JSON.stringify(metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("registers a referral brain mission, artifact and learning event", async () => {
    const result = analyzeLeadIntake({
      name: "Bianca Indicada",
      phone: "21966665555",
      legalArea: "Familia",
      pain: "Indicada por um cliente para avaliar revisao de alimentos.",
      referredBy: "Pedro Cliente",
      referralRelationship: "amigo da familia",
    });
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
          delete() { return this; },
          single() {
            const ids: Record<string, string> = {
              brain_tasks: "task-1",
              brain_runs: "run-1",
              brain_steps: "step-1",
              brain_artifacts: "artifact-1",
            };
            return Promise.resolve({ data: { id: ids[table] || `${table}-1` }, error: null });
          },
        };
        return builder;
      },
    };

    const trace = await registerReferralIntakeBrainArtifact({
      tenantId: "tenant-1",
      userId: "user-1",
      crmTaskId: "crm-task-1",
      result,
      supabase,
    });

    expect(trace).toEqual({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      artifactId: "artifact-1",
      eventType: "referral_intake_artifact_created",
    });
    const artifactInsert = inserts.find((item) => item.table === "brain_artifacts");
    expect(artifactInsert?.payload.artifact_type).toBe("referral_intake");
    expect(artifactInsert?.payload.metadata.crm_task_id).toBe("crm-task-1");
    expect(artifactInsert?.payload.metadata.next_step).toContain("confirmar consentimento");
    expect(JSON.stringify(artifactInsert?.payload.metadata)).not.toContain("21966665555");
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "referral_intake_artifact_created")).toBe(true);
  });
});
