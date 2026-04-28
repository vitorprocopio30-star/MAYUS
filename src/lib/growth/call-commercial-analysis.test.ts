import { describe, expect, it } from "vitest";
import {
  buildCallCommercialAnalysis,
  buildCallCommercialAnalysisArtifactMetadata,
  registerCallCommercialAnalysisBrainArtifact,
} from "./call-commercial-analysis";

function buildSupabaseMock(inserts: Array<{ table: string; payload: any }>) {
  const ids: Record<string, string> = {
    brain_tasks: "task-1",
    brain_runs: "run-1",
    brain_steps: "step-1",
    brain_artifacts: "artifact-1",
  };

  return {
    from: (table: string) => ({
      insert: (payload: any) => {
        inserts.push({ table, payload });

        if (table === "learning_events") return { error: null };

        return {
          select: () => ({
            single: async () => ({ data: { id: ids[table] }, error: null }),
          }),
        };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
}

describe("call commercial analysis", () => {
  it("builds deterministic analysis for a hot commercial call", () => {
    const analysis = buildCallCommercialAnalysis({
      leadName: "Maria Silva",
      legalArea: "Previdenciario",
      transcript: "A cliente disse que o beneficio foi negado pelo INSS e tem prazo para recurso amanha. Ela gostou da explicacao, quer avancar e pode mandar a carta do INSS e CNIS. A unica duvida e o valor e se pode parcelar.",
      currentScore: 60,
    });

    expect(analysis.mvpLabel).toBe("MVP upload/analysis - text transcript/notes only");
    expect(analysis.leadName).toBe("Maria Silva");
    expect(analysis.interestLevel).toBe("high");
    expect(analysis.advancementProbability).toBeGreaterThanOrEqual(70);
    expect(analysis.pain).toContain("beneficio foi negado");
    expect(analysis.objections).toEqual(expect.arrayContaining([expect.stringContaining("valor")]));
    expect(analysis.strengths).toEqual(expect.arrayContaining([
      "Call identificou urgencia ou risco temporal.",
      "Lead demonstrou sinal explicito de avanco.",
    ]));
    expect(analysis.crmUpdateHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "score", value: analysis.advancementProbability }),
      expect.objectContaining({ field: "stage", value: "Proxima acao comercial" }),
    ]));
    expect(analysis.requiresHumanReview).toBe(true);
    expect(analysis.externalSideEffectsBlocked).toBe(true);
  });

  it("surfaces weaknesses and missed opportunities for thin notes", () => {
    const analysis = buildCallCommercialAnalysis({
      leadName: "Joao",
      notes: "Ligacao rapida. Cliente vai pensar melhor e talvez volte depois.",
    });

    expect(analysis.interestLevel).toBe("low");
    expect(analysis.objections).toEqual(expect.arrayContaining([expect.stringContaining("pensar melhor")]));
    expect(analysis.weaknesses).toEqual(expect.arrayContaining([
      "Investimento e condicoes nao ficaram claros.",
      "Urgencia e prazos nao foram validados.",
      "Decisor e processo de decisao nao foram mapeados.",
    ]));
    expect(analysis.missedOpportunities).toEqual(expect.arrayContaining([
      "Definir proximo passo com data, canal e responsavel.",
      "Pedir documentos minimos para reduzir incerteza do caso.",
    ]));
  });

  it("builds safe artifact metadata without side effects", () => {
    const analysis = buildCallCommercialAnalysis({
      crmTaskId: "crm-task-1",
      leadName: "Bianca",
      legalArea: "Familia",
      notes: "Quer revisar alimentos, tem medo de conflito, mas nao sabe se consegue pagar agora.",
    });
    const metadata = buildCallCommercialAnalysisArtifactMetadata({ crmTaskId: "crm-task-1", analysis });

    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      mvp_label: "MVP upload/analysis - text transcript/notes only",
      interest_level: analysis.interestLevel,
      requires_human_review: true,
      external_side_effects_blocked: true,
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("does not persist raw transcript, pain, objections, or suggested follow-up in artifact metadata", () => {
    const analysis = buildCallCommercialAnalysis({
      leadName: "Renata",
      notes: "RAW_TRANSCRIPT_MARKER A dor completa narrada foi bloqueio urgente na conta. Objecao privada: valor alto e precisa parcelar.",
    });
    const metadata = buildCallCommercialAnalysisArtifactMetadata({ crmTaskId: "crm-task-safe", analysis });
    const metadataJson = JSON.stringify(metadata);

    expect(metadata).not.toHaveProperty("pain");
    expect(metadata).not.toHaveProperty("objections");
    expect(metadata).not.toHaveProperty("suggestedFollowUp");
    expect(metadataJson).not.toContain("RAW_TRANSCRIPT_MARKER");
    expect(metadataJson).not.toContain("dor completa narrada");
    expect(metadataJson).not.toContain("Objecao privada");
    expect(metadataJson).not.toContain(analysis.suggestedFollowUp);
  });

  it("registers a visible call analysis artifact with safe payload", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const analysis = buildCallCommercialAnalysis({
      leadName: "Livia",
      transcript: "TRANSCRIPT_SECRET Cliente quer avancar, mas falou que o valor precisa parcelar.",
    });

    const trace = await registerCallCommercialAnalysisBrainArtifact({
      tenantId: "tenant-1",
      userId: "user-1",
      crmTaskId: "crm-task-1",
      analysis,
      supabase: buildSupabaseMock(inserts),
    });

    expect(trace).toEqual({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      artifactId: "artifact-1",
      eventType: "call_analysis_artifact_created",
    });
    expect(inserts.map((item) => item.table)).toEqual([
      "brain_tasks",
      "brain_runs",
      "brain_steps",
      "brain_artifacts",
      "learning_events",
    ]);

    const artifact = inserts.find((item) => item.table === "brain_artifacts")?.payload;
    expect(artifact).toEqual(expect.objectContaining({
      artifact_type: "call_commercial_analysis",
      title: "Analise de call - Livia",
      metadata: expect.objectContaining({
        crm_task_id: "crm-task-1",
        lead_name: "Livia",
        requires_human_review: true,
        external_side_effects_blocked: true,
      }),
    }));
    expect(JSON.stringify(artifact.metadata)).not.toContain("TRANSCRIPT_SECRET");
    expect(JSON.stringify(artifact.metadata)).not.toContain(analysis.suggestedFollowUp);
  });
});
