import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SALES_LLM_TESTBENCH,
  SALES_LLM_TESTBENCH_MODELS,
  SALES_LLM_TEST_FIXTURES,
  buildSalesLlmReply,
  scoreSalesLlmReply,
  type SalesLlmFixture,
  type SalesLlmReply,
  type SalesLlmScore,
  type SalesLlmTestbenchConfig,
} from "./sales-llm-reply";

export type SalesLlmTestbenchResult = {
  fixture_id: string;
  fixture_description: string;
  model: string;
  ok: boolean;
  reply: SalesLlmReply | null;
  score: SalesLlmScore;
  error: string | null;
};

export type SalesLlmModelSummary = {
  model: string;
  fixture_count: number;
  success_count: number;
  failure_count: number;
  average_score: number;
  average_legal_risk: number;
  average_conversion_potential: number;
  human_review_count: number;
  notes: string[];
};

export type SalesLlmTestbenchBrainTrace = {
  task_id: string | null;
  run_id: string | null;
  step_id: string | null;
  artifact_id: string | null;
  learning_event_created: boolean;
  system_event_created: boolean;
};

export type SalesLlmTestbenchRun = {
  run_id: string;
  created_at: string;
  fixture_count: number;
  model_count: number;
  default_model: string;
  recommended_default_model: string | null;
  best_model: SalesLlmModelSummary | null;
  model_summaries: SalesLlmModelSummary[];
  results: SalesLlmTestbenchResult[];
  persisted: boolean;
  persistence_error: string | null;
  brain_trace: SalesLlmTestbenchBrainTrace | null;
};

export type RunSalesLlmTestbenchInput = {
  supabase: SupabaseClient;
  tenantId: string;
  userId?: string | null;
  models?: string[] | null;
  fixtures?: SalesLlmFixture[] | null;
  salesProfile?: {
    idealClient?: string | null;
    coreSolution?: string | null;
    uniqueValueProposition?: string | null;
    valuePillars?: string[] | null;
    positioningSummary?: string | null;
  } | null;
  autonomyMode?: "auto_respond" | "supervised" | "draft_only" | string | null;
  fetcher?: typeof fetch;
  persist?: boolean;
};

const ZERO_SCORE: SalesLlmScore = {
  total: 0,
  def_adherence: 0,
  clarity: 0,
  next_question: 0,
  legal_risk: 0,
  conversion_potential: 0,
  review_need: 0,
  notes: ["falha ao gerar resposta"],
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function uniqueModels(models?: string[] | null) {
  const selected = Array.isArray(models) && models.length
    ? models
    : [...SALES_LLM_TESTBENCH_MODELS];

  return Array.from(new Set(
    selected
      .map((model) => cleanText(model))
      .filter((model): model is string => Boolean(model))
  ));
}

function fixedModelConfig(model: string): SalesLlmTestbenchConfig {
  return {
    enabled: true,
    default_model: model,
    candidate_models: [model],
    routing_mode: "fixed",
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function buildModelSummaries(results: SalesLlmTestbenchResult[]): SalesLlmModelSummary[] {
  const byModel = new Map<string, SalesLlmTestbenchResult[]>();
  for (const result of results) {
    byModel.set(result.model, [...(byModel.get(result.model) || []), result]);
  }

  return Array.from(byModel.entries())
    .map(([model, rows]) => {
      const successes = rows.filter((row) => row.ok);
      const notes = Array.from(new Set(rows.flatMap((row) => row.score.notes))).slice(0, 6);

      return {
        model,
        fixture_count: rows.length,
        success_count: successes.length,
        failure_count: rows.length - successes.length,
        average_score: average(rows.map((row) => row.score.total)),
        average_legal_risk: average(rows.map((row) => row.score.legal_risk)),
        average_conversion_potential: average(rows.map((row) => row.score.conversion_potential)),
        human_review_count: rows.filter((row) => row.reply?.should_auto_send === false).length,
        notes,
      };
    })
    .sort((left, right) => {
      if (right.average_score !== left.average_score) return right.average_score - left.average_score;
      if (right.average_legal_risk !== left.average_legal_risk) return right.average_legal_risk - left.average_legal_risk;
      if (left.failure_count !== right.failure_count) return left.failure_count - right.failure_count;
      if (left.model === DEFAULT_SALES_LLM_TESTBENCH.default_model) return -1;
      if (right.model === DEFAULT_SALES_LLM_TESTBENCH.default_model) return 1;
      return left.model.localeCompare(right.model);
    });
}

function buildRunSummary(run: Omit<SalesLlmTestbenchRun, "persisted" | "persistence_error" | "brain_trace">) {
  const best = run.best_model;
  return best
    ? `Bancada LLM de vendas concluiu ${run.fixture_count} fixtures em ${run.model_count} modelos. Melhor modelo: ${best.model} (${best.average_score}/100).`
    : "Bancada LLM de vendas nao conseguiu recomendar modelo.";
}

function buildArtifactMetadata(run: Omit<SalesLlmTestbenchRun, "persisted" | "persistence_error" | "brain_trace">) {
  return {
    summary: buildRunSummary(run),
    run_id: run.run_id,
    default_model: run.default_model,
    recommended_default_model: run.recommended_default_model,
    best_model: run.best_model?.model || null,
    best_average_score: run.best_model?.average_score || 0,
    fixture_count: run.fixture_count,
    model_count: run.model_count,
    model_summaries: run.model_summaries,
    results: run.results.map((result) => ({
      fixture_id: result.fixture_id,
      fixture_description: result.fixture_description,
      model: result.model,
      ok: result.ok,
      score: result.score,
      reply: result.reply
        ? {
          text: result.reply.reply,
          intent: result.reply.intent,
          lead_stage: result.reply.lead_stage,
          confidence: result.reply.confidence,
          risk_flags: result.reply.risk_flags,
          next_action: result.reply.next_action,
          should_auto_send: result.reply.should_auto_send,
          expected_outcome: result.reply.expected_outcome,
        }
        : null,
      error: result.error,
    })),
    external_side_effects_blocked: true,
  };
}

async function persistSalesLlmTestbenchRun(params: {
  supabase: SupabaseClient;
  tenantId: string;
  userId?: string | null;
  run: Omit<SalesLlmTestbenchRun, "persisted" | "persistence_error" | "brain_trace">;
}): Promise<SalesLlmTestbenchBrainTrace> {
  const now = params.run.created_at;
  const metadata = buildArtifactMetadata(params.run);
  let systemEventCreated = false;

  const { error: eventError } = await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: params.userId || null,
    source: "growth",
    provider: "mayus",
    event_name: "sales_llm_testbench_run",
    status: params.run.best_model ? "ok" : "warning",
    payload: metadata,
    created_at: now,
  });

  if (eventError) throw eventError;
  systemEventCreated = true;

  const { data: task, error: taskError } = await params.supabase
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId || null,
      channel: "settings",
      module: "growth",
      status: "completed",
      title: "Bancada LLM de Vendas MAYUS",
      goal: "Comparar modelos de IA para atendimento comercial WhatsApp com guardrails juridicos.",
      task_input: {
        source: "api.growth.sales-llm-testbench",
        run_id: params.run.run_id,
        models: params.run.model_summaries.map((item) => item.model),
        fixture_count: params.run.fixture_count,
      },
      task_context: {
        artifact_type: "sales_llm_testbench_report",
        recommended_default_model: params.run.recommended_default_model,
      },
      policy_snapshot: {
        external_side_effects: false,
        secrets_allowed: false,
        fixtures_only: true,
      },
      result_summary: metadata.summary,
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single();

  if (taskError || !task?.id) throw taskError || new Error("brain_task_missing");

  const { data: brainRun, error: runError } = await params.supabase
    .from("brain_runs")
    .insert({
      task_id: task.id,
      tenant_id: params.tenantId,
      attempt_number: 1,
      status: "completed",
      summary: metadata.summary,
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single();

  if (runError || !brainRun?.id) throw runError || new Error("brain_run_missing");

  const { data: step, error: stepError } = await params.supabase
    .from("brain_steps")
    .insert({
      task_id: task.id,
      run_id: brainRun.id,
      tenant_id: params.tenantId,
      order_index: 1,
      step_key: "sales_llm_testbench",
      title: "Comparar modelos de venda WhatsApp",
      step_type: "evaluation",
      capability_name: "sales_llm_testbench_report",
      handler_type: "growth_sales_llm_testbench",
      status: "completed",
      input_payload: {
        models: params.run.model_summaries.map((item) => item.model),
        fixture_count: params.run.fixture_count,
      },
      output_payload: {
        recommended_default_model: params.run.recommended_default_model,
        best_average_score: params.run.best_model?.average_score || 0,
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
      run_id: brainRun.id,
      step_id: step.id,
      artifact_type: "sales_llm_testbench_report",
      title: `Bancada LLM de Vendas - ${params.run.recommended_default_model || "sem recomendacao"}`,
      mime_type: "application/json",
      source_module: "growth",
      metadata,
    })
    .select("id")
    .single();

  if (artifactError) throw artifactError;

  const { error: learningError } = await params.supabase.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: task.id,
    run_id: brainRun.id,
    step_id: step.id,
    event_type: "sales_llm_testbench_artifact_created",
    source_module: "growth",
    payload: {
      artifact_id: artifact?.id || null,
      recommended_default_model: params.run.recommended_default_model,
      best_average_score: params.run.best_model?.average_score || 0,
      model_count: params.run.model_count,
      fixture_count: params.run.fixture_count,
      external_side_effects_blocked: true,
    },
    created_by: params.userId || null,
  });

  return {
    task_id: task.id,
    run_id: brainRun.id,
    step_id: step.id,
    artifact_id: artifact?.id || null,
    learning_event_created: !learningError,
    system_event_created: systemEventCreated,
  };
}

export async function runSalesLlmTestbench(input: RunSalesLlmTestbenchInput): Promise<SalesLlmTestbenchRun> {
  const createdAt = new Date().toISOString();
  const runId = `sales_llm_testbench_${createdAt.replace(/[-:.]/g, "").slice(0, 15)}`;
  const fixtures = Array.isArray(input.fixtures) && input.fixtures.length
    ? input.fixtures
    : SALES_LLM_TEST_FIXTURES;
  const models = uniqueModels(input.models);
  const results: SalesLlmTestbenchResult[] = [];

  for (const fixture of fixtures) {
    for (const model of models) {
      try {
        const reply = await buildSalesLlmReply({
          supabase: input.supabase,
          tenantId: input.tenantId,
          contactName: fixture.description,
          messages: fixture.messages,
          salesProfile: input.salesProfile,
          testbench: fixedModelConfig(model),
          leadStage: fixture.expectedStage,
          autonomyMode: input.autonomyMode || "auto_respond",
          fetcher: input.fetcher,
        });
        const score = scoreSalesLlmReply(reply, fixture);
        results.push({
          fixture_id: fixture.id,
          fixture_description: fixture.description,
          model,
          ok: true,
          reply,
          score,
          error: null,
        });
      } catch (error: any) {
        results.push({
          fixture_id: fixture.id,
          fixture_description: fixture.description,
          model,
          ok: false,
          reply: null,
          score: {
            ...ZERO_SCORE,
            notes: [cleanText(error?.message) || "falha ao gerar resposta"],
          },
          error: cleanText(error?.message) || "Falha desconhecida",
        });
      }
    }
  }

  const modelSummaries = buildModelSummaries(results);
  const bestModel = modelSummaries[0] || null;
  const baseRun = {
    run_id: runId,
    created_at: createdAt,
    fixture_count: fixtures.length,
    model_count: models.length,
    default_model: DEFAULT_SALES_LLM_TESTBENCH.default_model,
    recommended_default_model: bestModel?.model || null,
    best_model: bestModel,
    model_summaries: modelSummaries,
    results,
  };

  if (!input.persist) {
    return {
      ...baseRun,
      persisted: false,
      persistence_error: null,
      brain_trace: null,
    };
  }

  try {
    const brainTrace = await persistSalesLlmTestbenchRun({
      supabase: input.supabase,
      tenantId: input.tenantId,
      userId: input.userId,
      run: baseRun,
    });

    return {
      ...baseRun,
      persisted: true,
      persistence_error: null,
      brain_trace: brainTrace,
    };
  } catch (error: any) {
    return {
      ...baseRun,
      persisted: false,
      persistence_error: cleanText(error?.message) || "Falha ao persistir bancada LLM",
      brain_trace: null,
    };
  }
}
