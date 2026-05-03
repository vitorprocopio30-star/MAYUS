import type { BrainAuthContext } from "@/lib/brain/server";
import { brainAdminSupabase } from "@/lib/brain/server";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import { normalizeLLMProvider, type LLMProvider } from "@/lib/llm-router";

const PROVIDER_PRIORITY: readonly LLMProvider[] = ["openrouter", "openai", "google", "groq", "anthropic"];
const BRAIN_DISPATCH_TIMEOUT_MS = 8000;
const BRAIN_CHAT_FETCH_TIMEOUT_MS = 28000;

export interface NormalizedHistoryItem {
  role: "user" | "model";
  content: string;
}

export interface ExecuteBrainTurnInput {
  authContext: BrainAuthContext;
  baseUrl: string;
  cookieHeader: string;
  goal: string;
  title?: string;
  module: string;
  channel: string;
  taskInput?: Record<string, unknown>;
  taskContext?: Record<string, unknown>;
  policySnapshot?: Record<string, unknown>;
  preferredProvider?: string | null;
  model?: string | null;
  history?: NormalizedHistoryItem[];
  learningEventType: string;
  learningPayload?: Record<string, unknown>;
}

export interface ExecuteBrainTurnOutput {
  reply: string;
  kernel: Record<string, unknown>;
  taskId: string;
  runId: string;
  stepId: string;
  provider: LLMProvider;
  responseStatus: number;
  error?: string | null;
}

export function normalizeChatHistory(history: unknown): NormalizedHistoryItem[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item && typeof item === "object")
    .map<NormalizedHistoryItem>((item) => {
      const role = (item as { role?: unknown }).role === "model" ? "model" : "user";
      const content = typeof (item as { content?: unknown }).content === "string"
        ? (item as { content: string }).content.slice(0, 10000)
        : "";

      return { role, content };
    })
    .filter((item) => item.content.trim().length > 0)
    .slice(-12);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message?: unknown }).message || "Erro desconhecido");
  return String(error || "Erro desconhecido");
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolvePreferredBrainProvider(
  tenantId: string,
  preferredProvider?: string | null
): Promise<LLMProvider | null> {
  const preferred = normalizeLLMProvider(preferredProvider);
  const [{ data: settings }, integrations] = await Promise.all([
    brainAdminSupabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    listTenantIntegrationsResolved(tenantId, ["openrouter", "openai", "google", "gemini", "groq", "grok", "anthropic"]),
  ]);

  const aiFeatures = (settings?.ai_features as Record<string, unknown> | null) || {};
  const configuredProvider = normalizeLLMProvider(
    String(
      aiFeatures.brain_provider ||
      aiFeatures.default_brain_provider ||
      aiFeatures.primary_llm_provider ||
      aiFeatures.default_llm_provider ||
      ""
    )
  );

  const connectedProviders = new Set<LLMProvider>();

  for (const integration of integrations || []) {
    const provider = normalizeLLMProvider(integration.provider);
    const apiKey = String(integration.api_key || "").trim();
    const status = String(integration.status || "").trim().toLowerCase();

    if (!provider || !apiKey || (status && status !== "connected")) continue;
    connectedProviders.add(provider);
  }

  if (preferred && connectedProviders.has(preferred)) {
    return preferred;
  }

  if (configuredProvider && connectedProviders.has(configuredProvider)) {
    return configuredProvider;
  }

  for (const provider of PROVIDER_PRIORITY) {
    if (connectedProviders.has(provider)) return provider;
  }

  return preferred || configuredProvider;
}

function mapKernelStatusToBrainStatus(status: string | undefined) {
  switch (status) {
    case "awaiting_approval":
      return "awaiting_approval";
    case "blocked":
    case "permission_denied":
    case "failed":
      return "failed";
    case "executed":
    case "success":
      return "completed";
    default:
      return "completed_with_warnings";
  }
}

export async function executeBrainTurn(input: ExecuteBrainTurnInput): Promise<ExecuteBrainTurnOutput> {
  const preferredProvider = await resolvePreferredBrainProvider(input.authContext.tenantId, input.preferredProvider);
  if (!preferredProvider) {
    throw new Error("Nenhuma integracao de IA principal esta configurada para o escritorio.");
  }

  const dispatchUrl = new URL("/api/brain/dispatch", input.baseUrl);
  const chatUrl = new URL("/api/ai/chat", input.baseUrl);

  const dispatchResponse = await fetchWithTimeout(dispatchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: input.cookieHeader,
    },
    body: JSON.stringify({
      goal: input.goal,
      title: input.title || input.goal.slice(0, 120),
      module: input.module,
      channel: input.channel,
      task_input: input.taskInput || {},
      task_context: input.taskContext || {},
      policy_snapshot: {
        primary_brain_provider: preferredProvider,
        ...(input.policySnapshot || {}),
      },
    }),
  }, BRAIN_DISPATCH_TIMEOUT_MS);

  const dispatchData = await dispatchResponse.json().catch(() => ({}));
  if (!dispatchResponse.ok || !dispatchData?.task?.id || !dispatchData?.run?.id || !dispatchData?.step?.id) {
    throw new Error(dispatchData?.error || "Nao foi possivel abrir a missao no cerebro principal.");
  }

  const taskId = String(dispatchData.task.id);
  const runId = String(dispatchData.run.id);
  const stepId = String(dispatchData.step.id);
  const startedAt = new Date().toISOString();

  await Promise.all([
    brainAdminSupabase.from("brain_runs").update({ status: "executing", started_at: startedAt }).eq("id", runId),
    brainAdminSupabase.from("brain_steps").update({ status: "running", started_at: startedAt }).eq("id", stepId),
    brainAdminSupabase.from("brain_tasks").update({ status: "executing" }).eq("id", taskId),
  ]);

  let chatData: any = {};
  let chatOk = false;
  let chatStatus = 503;
  let fetchErrorMessage: string | null = null;

  try {
    const chatResponse = await fetchWithTimeout(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: input.cookieHeader,
      },
      body: JSON.stringify({
        message: input.goal,
        provider: preferredProvider,
        model: input.model || undefined,
        history: input.history || [],
        channel: input.channel,
        taskId,
        runId,
        stepId,
      }),
    }, BRAIN_CHAT_FETCH_TIMEOUT_MS);

    chatOk = chatResponse.ok;
    chatStatus = chatResponse.status || (chatOk ? 200 : 503);
    chatData = await chatResponse.json().catch(() => ({}));
  } catch (error) {
    fetchErrorMessage = getErrorMessage(error);
  }

  const kernelStatus = String(chatData?.kernel?.status || (chatOk ? "success" : "failed"));
  const brainStatus = mapKernelStatusToBrainStatus(kernelStatus);
  const completedAt = new Date().toISOString();
  const errorMessage = chatOk ? null : String(fetchErrorMessage || chatData?.error || "Falha ao consultar o cerebro principal.");
  const reply = typeof chatData?.reply === "string" && chatData.reply.trim()
    ? chatData.reply
    : errorMessage
      ? `Nao consegui concluir esta missao agora: ${errorMessage}`
      : "";

  const kernel = {
    ...(chatData?.kernel && typeof chatData.kernel === "object" ? chatData.kernel : {}),
    status: kernelStatus,
    taskId,
    runId,
    stepId,
  } as Record<string, unknown>;

  await Promise.all([
    brainAdminSupabase
      .from("brain_tasks")
      .update({
        status: brainStatus,
        result_summary: reply || null,
        error_message: errorMessage,
        completed_at: brainStatus === "awaiting_approval" ? null : completedAt,
      })
      .eq("id", taskId),
    brainAdminSupabase
      .from("brain_runs")
      .update({
        status: brainStatus,
        summary: reply || null,
        error_message: errorMessage,
        completed_at: brainStatus === "awaiting_approval" ? null : completedAt,
      })
      .eq("id", runId),
    brainAdminSupabase
      .from("brain_steps")
      .update({
        status: brainStatus === "awaiting_approval" ? "awaiting_approval" : brainStatus === "completed" ? "completed" : "failed",
        output_payload: {
          reply,
          kernel,
        },
        error_payload: errorMessage ? { error: errorMessage } : {},
        completed_at: brainStatus === "awaiting_approval" ? null : completedAt,
      })
      .eq("id", stepId),
    brainAdminSupabase.from("learning_events").insert({
      tenant_id: input.authContext.tenantId,
      task_id: taskId,
      run_id: runId,
      step_id: stepId,
      event_type: input.learningEventType,
      source_module: input.module,
      payload: {
        goal: input.goal,
        provider: preferredProvider,
        model: input.model || null,
        kernel_status: kernelStatus,
        reply,
        ...(input.learningPayload || {}),
      },
      created_by: input.authContext.userId,
    }),
  ]);

  if (kernelStatus === "awaiting_approval" && kernel.awaitingPayload) {
    await brainAdminSupabase.from("brain_approvals").insert({
      task_id: taskId,
      run_id: runId,
      step_id: stepId,
      tenant_id: input.authContext.tenantId,
      requested_by: input.authContext.userId,
      status: "pending",
      risk_level: String((kernel.awaitingPayload as { riskLevel?: string }).riskLevel || "medium"),
      approval_context: {
        source: input.module,
        audit_log_id: kernel.auditLogId || null,
        awaiting_payload: kernel.awaitingPayload,
      },
    });
  }

  if (reply.trim().length > 0 && brainStatus !== "awaiting_approval") {
    try {
      await createBrainArtifact({
        tenantId: input.authContext.tenantId,
        taskId,
        runId,
        stepId,
        artifactType: "mission_result",
        title: input.title || input.goal.slice(0, 80),
        sourceModule: input.module,
        mimeType: "text/markdown",
        dedupeKey: `mission-result:${taskId}:${stepId}`,
        metadata: {
          reply,
          channel: input.channel,
          provider: preferredProvider,
          model: input.model || null,
          status: brainStatus,
        },
      });
    } catch (artifactError) {
      console.error("[brain/turn] artifact registrar", artifactError);
    }
  }

  return {
    reply,
    kernel,
    taskId,
    runId,
    stepId,
    provider: preferredProvider,
    responseStatus: chatOk ? 200 : chatStatus || 503,
    error: errorMessage,
  };
}
