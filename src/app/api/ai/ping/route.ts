import { NextResponse } from "next/server";
import { buildAINoticeForFailure, classifyLLMFailure } from "@/lib/llm-errors";
import {
  buildHeaders,
  getDefaultModelForUseCase,
  normalizeLLMProvider,
  type LLMClient,
  type LLMProvider,
} from "@/lib/llm-router";

type PingProvider = Extract<LLMProvider, "openai" | "google" | "openrouter">;

const PING_PROVIDERS: Record<PingProvider, { endpoint: string; label: string }> = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    label: "OpenAI (ChatGPT)",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    label: "Google Gemini",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    label: "OpenRouter",
  },
};

function isPingProvider(provider: LLMProvider | null): provider is PingProvider {
  return provider === "openai" || provider === "google" || provider === "openrouter";
}

async function readSafeResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function pingManualProvider(providerInput: string, apiKey: string, fetchImpl: typeof fetch = fetch) {
  const provider = normalizeLLMProvider(providerInput);

  if (!isPingProvider(provider)) {
    return {
      ok: true as const,
      message: `Integração pronta para o provedor: ${providerInput}. (Teste específico em breve)`,
    };
  }

  const config = PING_PROVIDERS[provider];
  const client: LLMClient = {
    provider,
    model: getDefaultModelForUseCase(provider, "chat_geral"),
    apiKey,
    endpoint: config.endpoint,
    extraHeaders: provider === "openrouter"
      ? {
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://mayus.app",
          "X-Title": "MAYUS",
        }
      : {},
  };

  try {
    const response = await fetchImpl(client.endpoint, {
      method: "POST",
      headers: buildHeaders(client),
      body: JSON.stringify({
        model: client.model,
        messages: [{ role: "user", content: "Responda apenas com a palavra: PONG" }],
        max_tokens: 5,
      }),
    });

    const body = await readSafeResponseBody(response);
    if (!response.ok) {
      const failureKind = classifyLLMFailure({ status: response.status, body });
      return {
        ok: false as const,
        status: failureKind === "invalid_key" || failureKind === "missing_key" ? 401 : 503,
        notice: buildAINoticeForFailure(failureKind, false),
      };
    }

    return {
      ok: true as const,
      message: `Conexão com ${config.label} estabelecida!`,
    };
  } catch (error) {
    const failureKind = classifyLLMFailure({ error });
    return {
      ok: false as const,
      status: failureKind === "invalid_key" || failureKind === "missing_key" ? 401 : 503,
      notice: buildAINoticeForFailure(failureKind, false),
    };
  }
}

export async function POST(req: Request) {
  try {
    const { provider, apiKey } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider ou chave de API ausente." },
        { status: 400 }
      );
    }

    const result = await pingManualProvider(provider, apiKey);
    if (result.ok) {
      return NextResponse.json({ success: true, message: result.message });
    }

    return NextResponse.json(
      { error: result.notice.message, ai_notice: result.notice },
      { status: result.status }
    );
  } catch {
    const notice = buildAINoticeForFailure("unknown", false);
    return NextResponse.json(
      { error: notice.message, ai_notice: notice },
      { status: 500 }
    );
  }
}
