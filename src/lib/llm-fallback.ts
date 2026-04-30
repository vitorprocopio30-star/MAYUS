import { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaders, getLLMClientCandidates, type LLMClientCandidate, type LLMUseCase } from "@/lib/llm-router";
import { buildAINoticeForFailure, classifyLLMFailure, type AINotice, type LLMFailureKind } from "@/lib/llm-errors";

export type LLMFallbackTrace = {
  provider: string;
  model: string;
  source: "tenant" | "env";
  failureKind: LLMFailureKind;
};

export type LLMFallbackResult<T = unknown> =
  | {
      ok: true;
      data: T;
      usedClient: Omit<LLMClientCandidate, "apiKey">;
      fallbackTrace: LLMFallbackTrace[];
      notice?: AINotice;
    }
  | {
      ok: false;
      failureKind: LLMFailureKind;
      fallbackTrace: LLMFallbackTrace[];
      notice: AINotice;
    };

export type CallLLMWithFallbackOptions = {
  supabase: SupabaseClient;
  tenantId: string;
  useCase: LLMUseCase;
  preferredProvider?: string | null;
  allowNonOpenAICompatible?: boolean;
  request: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function sanitizeClient(client: LLMClientCandidate): Omit<LLMClientCandidate, "apiKey"> {
  const { apiKey: _apiKey, ...safeClient } = client;
  return safeClient;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function callLLMWithFallback<T = unknown>(options: CallLLMWithFallbackOptions): Promise<LLMFallbackResult<T>> {
  const candidates = await getLLMClientCandidates(options.supabase, options.tenantId, options.useCase, {
    preferredProvider: options.preferredProvider,
    allowNonOpenAICompatible: options.allowNonOpenAICompatible,
  });
  const fallbackTrace: LLMFallbackTrace[] = [];

  if (candidates.length === 0) {
    return {
      ok: false,
      failureKind: "missing_key",
      fallbackTrace,
      notice: buildAINoticeForFailure("missing_key", false),
    };
  }

  const fetchImpl = options.fetchImpl || fetch;
  let lastFailure: LLMFailureKind = "unknown";

  for (const client of candidates) {
    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller && options.timeoutMs
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : null;

      const response = await fetchImpl(client.endpoint, {
        method: "POST",
        headers: buildHeaders(client),
        body: JSON.stringify({
          model: client.model,
          ...options.request,
        }),
        signal: controller?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);

      const data = await parseResponse(response);
      if (!response.ok) {
        lastFailure = classifyLLMFailure({ status: response.status, body: data });
        fallbackTrace.push({
          provider: client.provider,
          model: client.model,
          source: client.source,
          failureKind: lastFailure,
        });
        continue;
      }

      return {
        ok: true,
        data: data as T,
        usedClient: sanitizeClient(client),
        fallbackTrace,
        notice: fallbackTrace.length > 0 ? buildAINoticeForFailure(lastFailure, true) : undefined,
      };
    } catch (error) {
      lastFailure = classifyLLMFailure({ error });
      fallbackTrace.push({
        provider: client.provider,
        model: client.model,
        source: client.source,
        failureKind: lastFailure,
      });
    }
  }

  return {
    ok: false,
    failureKind: lastFailure,
    fallbackTrace,
    notice: buildAINoticeForFailure(lastFailure, false),
  };
}
