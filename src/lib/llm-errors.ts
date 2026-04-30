export type LLMFailureKind =
  | "missing_key"
  | "invalid_key"
  | "insufficient_quota"
  | "rate_limited"
  | "model_unavailable"
  | "provider_unavailable"
  | "timeout"
  | "bad_response"
  | "unknown";

export type AINotice = {
  code: "ai_fallback_used" | "ai_unavailable" | "ai_configuration_required" | "ai_credit_or_limit_issue";
  message: string;
  severity: "info" | "warning" | "error";
};

function textFromErrorBody(body: unknown) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
  return [record.message, record.error, nested?.message, nested?.code, nested?.type]
    .filter((item) => typeof item === "string")
    .join(" ")
    .toLowerCase();
}

export function classifyLLMFailure(input: {
  status?: number | null;
  body?: unknown;
  error?: unknown;
}): LLMFailureKind {
  const status = input.status || null;
  const message = `${textFromErrorBody(input.body)} ${input.error instanceof Error ? input.error.message : ""}`.toLowerCase();

  if (/timeout|aborted|timed out/.test(message)) return "timeout";
  if (status === 401 || status === 403 || /invalid.*key|unauthorized|authentication|forbidden|permission/.test(message)) return "invalid_key";
  if (status === 402 || /insufficient_quota|insufficient.*credit|credit|quota|billing/.test(message)) return "insufficient_quota";
  if (status === 429 || /rate.?limit|too many requests/.test(message)) return "rate_limited";
  if (status === 404 || /model.*not.*found|model.*unavailable|not available/.test(message)) return "model_unavailable";
  if (status && status >= 500) return "provider_unavailable";
  if (status && status >= 400) return "bad_response";
  return "unknown";
}

export function buildAINoticeForFailure(kind: LLMFailureKind, fallbackUsed: boolean): AINotice {
  if (fallbackUsed) {
    return {
      code: "ai_fallback_used",
      message: "Seu provedor principal de IA nao respondeu agora. Usei uma alternativa configurada para concluir a tarefa.",
      severity: "warning",
    };
  }

  if (kind === "missing_key" || kind === "invalid_key") {
    return {
      code: "ai_configuration_required",
      message: "A integracao de IA precisa ser configurada antes de executar esta tarefa.",
      severity: "error",
    };
  }

  if (kind === "insufficient_quota" || kind === "rate_limited") {
    return {
      code: "ai_credit_or_limit_issue",
      message: "Nao consegui usar o modelo principal porque a integracao de IA precisa de credito ou limite disponivel. Posso continuar em modo limitado quando a tarefa permitir.",
      severity: "warning",
    };
  }

  return {
    code: "ai_unavailable",
    message: "Nao consegui acessar um modelo de IA disponivel agora. Tente novamente em alguns instantes ou revise as integracoes.",
    severity: "error",
  };
}
