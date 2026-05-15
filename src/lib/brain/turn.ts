import type { BrainAuthContext } from "@/lib/brain/server";
import { brainAdminSupabase } from "@/lib/brain/server";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import { normalizeLLMProvider, type LLMProvider } from "@/lib/llm-router";
import {
  buildMayusOrbPresentingEvent,
  buildMayusOrbWorkingEvent,
  withMayusOrbEvent,
  type MayusOrbEvent,
  type MayusOrbStatus,
} from "@/lib/brain/orb-events";

const PROVIDER_PRIORITY: readonly LLMProvider[] = ["openrouter", "openai", "google", "groq", "anthropic"];
const BRAIN_CHAT_TIMEOUT_MS = 35_000;

export type BrainMissionKind =
  | "case_status"
  | "process_mission_plan"
  | "process_execute_next"
  | "general_brain";

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
  voiceReply: string;
  missionKind: BrainMissionKind;
  approvalRequired: boolean;
  approvalId: string | null;
  kernel: Record<string, unknown>;
  taskId: string;
  runId: string;
  stepId: string;
  provider: LLMProvider;
  responseStatus: number;
  orb: MayusOrbEvent | null;
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

function mapKernelStatusToBrainStatus(status: string | undefined): Exclude<MayusOrbStatus, "executing"> {
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

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanOptionalString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeBrainMissionKind(value: unknown): BrainMissionKind {
  switch (value) {
    case "case_status":
    case "process_mission_plan":
    case "process_execute_next":
    case "general_brain":
      return value;
    default:
      return "general_brain";
  }
}

function inferBrainMissionKind(params: {
  requested?: unknown;
  kernel?: Record<string, unknown>;
}): BrainMissionKind {
  const requested = normalizeBrainMissionKind(params.requested);
  if (requested !== "general_brain") return requested;

  const capabilityName = cleanOptionalString(params.kernel?.capabilityName);
  const handlerType = cleanOptionalString(params.kernel?.handlerType);
  const signal = `${capabilityName}:${handlerType}`;

  if (signal.includes("support_case_status") || signal.includes("lex_support_case_status")) {
    return "case_status";
  }
  if (signal.includes("legal_process_mission_plan") || signal.includes("lex_process_mission_plan")) {
    return "process_mission_plan";
  }
  if (signal.includes("legal_process_mission_execute_next") || signal.includes("lex_process_mission_execute_next")) {
    return "process_execute_next";
  }

  return "general_brain";
}

function trimSentence(value: string, maxLength = 360) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripMarkdownForVoice(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBrainVoiceReply(params: {
  reply?: unknown;
  status?: string | null;
  missionKind?: BrainMissionKind;
  errorMessage?: string | null;
}) {
  if (params.status === "awaiting_approval") {
    return "Encontrei o caminho mais seguro. Antes de executar, preciso da sua aprovação.";
  }

  if (params.status === "timeout") {
    return "Doutor, o Brain demorou mais que o limite seguro. Encerrei a análise para não travar.";
  }

  if (params.errorMessage) {
    return "Doutor, encontrei um bloqueio nessa missão. Vou deixar o motivo registrado no MAYUS.";
  }

  const cleanReply = stripMarkdownForVoice(cleanOptionalString(params.reply));
  if (cleanReply) return trimSentence(cleanReply);

  switch (params.missionKind) {
    case "case_status":
      return "Consultei o status do caso e registrei a resposta no MAYUS.";
    case "process_mission_plan":
      return "Organizei a missão processual e deixei o próximo passo registrado.";
    case "process_execute_next":
      return "Executei o próximo passo seguro da missão processual.";
    default:
      return "Missão concluída no Brain do MAYUS.";
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError" ||
    Boolean(error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError");
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function withOptionalOrbPayload<T extends Record<string, unknown>>(payload: T, orb: MayusOrbEvent | null) {
  return orb ? { ...payload, mayus_orb: orb } : payload;
}

export async function executeBrainTurn(input: ExecuteBrainTurnInput): Promise<ExecuteBrainTurnOutput> {
  const preferredProvider = await resolvePreferredBrainProvider(input.authContext.tenantId, input.preferredProvider);
  if (!preferredProvider) {
    throw new Error("Nenhuma integracao de IA principal esta configurada para o escritorio.");
  }
  const requestedMissionKind = normalizeBrainMissionKind(input.taskContext?.missionKind);
  const source = cleanOptionalString(input.taskContext?.source, input.channel);

  const dispatchUrl = new URL("/api/brain/dispatch", input.baseUrl);
  const chatUrl = new URL("/api/ai/chat", input.baseUrl);

  const dispatchResponse = await fetch(dispatchUrl, {
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
      task_context: {
        source,
        channel: input.channel,
        mission_kind: requestedMissionKind,
        provider: cleanOptionalString(input.taskContext?.provider, preferredProvider),
        ...(input.taskContext || {}),
      },
      policy_snapshot: {
        primary_brain_provider: preferredProvider,
        ...(input.policySnapshot || {}),
      },
    }),
  });

  const dispatchData = await dispatchResponse.json().catch(() => ({}));
  if (!dispatchResponse.ok || !dispatchData?.task?.id || !dispatchData?.run?.id || !dispatchData?.step?.id) {
    throw new Error(dispatchData?.error || "Nao foi possivel abrir a missao no cerebro principal.");
  }

  const taskId = String(dispatchData.task.id);
  const runId = String(dispatchData.run.id);
  const stepId = String(dispatchData.step.id);
  const startedAt = new Date().toISOString();
  const initialStepPayload = getRecord(dispatchData.step.input_payload);
  const shouldEmitOrb = input.channel === "voice";
  const workingOrb = shouldEmitOrb
    ? buildMayusOrbWorkingEvent({
        taskId,
        runId,
        stepId,
        sourceModule: input.module,
      })
    : null;

  await Promise.all([
    brainAdminSupabase.from("brain_runs").update({ status: "executing", started_at: startedAt }).eq("id", runId),
    brainAdminSupabase
      .from("brain_steps")
      .update({
        status: "running",
        started_at: startedAt,
        input_payload: workingOrb ? withMayusOrbEvent(initialStepPayload, workingOrb) : initialStepPayload,
      })
      .eq("id", stepId),
    brainAdminSupabase.from("brain_tasks").update({ status: "executing" }).eq("id", taskId),
  ]);

  let chatResponse: Response;
  try {
    chatResponse = await fetchWithTimeout(chatUrl, {
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
    }, BRAIN_CHAT_TIMEOUT_MS);
  } catch (error) {
    if (!isAbortError(error)) throw error;

    const completedAt = new Date().toISOString();
    const errorMessage = "Timeout: o MAYUS Brain demorou mais que o limite seguro para responder.";
    const voiceReply = buildBrainVoiceReply({
      reply: errorMessage,
      status: "timeout",
      missionKind: requestedMissionKind,
      errorMessage,
    });
    const finalOrb = shouldEmitOrb
      ? buildMayusOrbPresentingEvent({
          status: "failed",
          taskId,
          runId,
          stepId,
          sourceModule: input.module,
        })
      : null;
    const kernel = {
      status: "timeout",
      taskId,
      runId,
      stepId,
      channel: input.channel,
      source,
      provider: preferredProvider,
      missionKind: requestedMissionKind,
      voiceReply,
      approvalRequired: false,
      approvalId: null,
      ...(finalOrb ? { orb: finalOrb } : {}),
    } as Record<string, unknown>;

    await Promise.all([
      brainAdminSupabase
        .from("brain_tasks")
        .update({
          status: "failed",
          result_summary: null,
          error_message: errorMessage,
          completed_at: completedAt,
        })
        .eq("id", taskId),
      brainAdminSupabase
        .from("brain_runs")
        .update({
          status: "failed",
          summary: null,
          error_message: errorMessage,
          completed_at: completedAt,
        })
        .eq("id", runId),
      brainAdminSupabase
        .from("brain_steps")
        .update({
          status: "failed",
          output_payload: withOptionalOrbPayload({
            reply: errorMessage,
            kernel,
          }, finalOrb),
          error_payload: { error: errorMessage },
          completed_at: completedAt,
        })
        .eq("id", stepId),
      brainAdminSupabase.from("learning_events").insert({
        tenant_id: input.authContext.tenantId,
        task_id: taskId,
        run_id: runId,
        step_id: stepId,
        event_type: input.learningEventType,
        source_module: input.module,
        payload: withOptionalOrbPayload({
          goal: input.goal,
          channel: input.channel,
          source,
          provider: preferredProvider,
          model: input.model || null,
          mission_kind: requestedMissionKind,
          kernel_status: "timeout",
          reply: errorMessage,
          voice_reply: voiceReply,
          ...(input.learningPayload || {}),
        }, finalOrb),
        created_by: input.authContext.userId,
      }),
    ]);

    return {
      reply: errorMessage,
      kernel,
      taskId,
      runId,
      stepId,
      provider: preferredProvider,
      responseStatus: 504,
      orb: finalOrb,
      voiceReply,
      missionKind: requestedMissionKind,
      approvalRequired: false,
      approvalId: null,
      error: errorMessage,
    };
  }

  const chatData = await chatResponse.json().catch(() => ({}));
  const kernelStatus = String(chatData?.kernel?.status || (chatResponse.ok ? "success" : "failed"));
  const brainStatus = mapKernelStatusToBrainStatus(kernelStatus);
  const completedAt = new Date().toISOString();
  const reply = typeof chatData?.reply === "string" ? chatData.reply : "";
  const errorMessage = chatResponse.ok ? null : String(chatData?.error || "Falha ao consultar o cerebro principal.");
  const chatKernel = getRecord(chatData?.kernel);
  const missionKind = inferBrainMissionKind({
    requested: requestedMissionKind,
    kernel: chatKernel,
  });
  const voiceReply = buildBrainVoiceReply({
    reply,
    status: kernelStatus,
    missionKind,
    errorMessage,
  });
  const finalOrb = shouldEmitOrb
    ? buildMayusOrbPresentingEvent({
        status: brainStatus,
        taskId,
        runId,
        stepId,
        capabilityName: chatKernel.capabilityName,
        handlerType: chatKernel.handlerType,
        sourceModule: input.module,
      })
    : null;
  const approvalRequired = kernelStatus === "awaiting_approval" && Boolean(chatKernel.awaitingPayload);
  let approvalId: string | null = null;

  if (approvalRequired) {
    const { data: approvalData, error: approvalError } = await brainAdminSupabase
      .from("brain_approvals")
      .insert({
        task_id: taskId,
        run_id: runId,
        step_id: stepId,
        tenant_id: input.authContext.tenantId,
        requested_by: input.authContext.userId,
        status: "pending",
        risk_level: String((chatKernel.awaitingPayload as { riskLevel?: string }).riskLevel || "medium"),
        approval_context: {
          source,
          source_module: input.module,
          channel: input.channel,
          mission_kind: missionKind,
          audit_log_id: chatKernel.auditLogId || null,
          awaiting_payload: chatKernel.awaitingPayload,
        },
      })
      .select("id")
      .maybeSingle();

    if (approvalError) {
      console.error("[brain/turn] approval registrar", approvalError);
    }
    approvalId = typeof approvalData?.id === "string" && approvalData.id.trim()
      ? approvalData.id.trim()
      : null;
  }

  const kernel = {
    ...chatKernel,
    status: kernelStatus,
    taskId,
    runId,
    stepId,
    channel: input.channel,
    source,
    provider: preferredProvider,
    missionKind,
    voiceReply,
    approvalRequired,
    approvalId,
    ...(finalOrb ? { orb: finalOrb } : {}),
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
        output_payload: withOptionalOrbPayload({
          reply,
          kernel,
        }, finalOrb),
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
      payload: withOptionalOrbPayload({
        goal: input.goal,
        channel: input.channel,
        source,
        provider: preferredProvider,
        model: input.model || null,
        mission_kind: missionKind,
        kernel_status: kernelStatus,
        reply,
        voice_reply: voiceReply,
        approval_required: approvalRequired,
        approval_id: approvalId,
        ...(input.learningPayload || {}),
      }, finalOrb),
      created_by: input.authContext.userId,
    }),
  ]);

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
        metadata: withOptionalOrbPayload({
          reply,
          voice_reply: voiceReply,
          channel: input.channel,
          source,
          provider: preferredProvider,
          model: input.model || null,
          mission_kind: missionKind,
          status: brainStatus,
        }, finalOrb),
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
    responseStatus: chatResponse.ok ? 200 : chatResponse.status || 500,
    orb: finalOrb,
    voiceReply,
    missionKind,
    approvalRequired,
    approvalId,
    error: errorMessage,
  };
}
