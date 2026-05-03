import { NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import {
  getDefaultModelForUseCase,
  normalizeLLMProvider,
  type LLMProvider,
} from "@/lib/llm-router";

export const dynamic = "force-dynamic";

const PRIORITY: readonly LLMProvider[] = ["openrouter", "openai", "google", "groq", "anthropic"];
const STATUS_QUERY_TIMEOUT_MS = 5000;
const INTEGRATION_PROVIDERS = ["openrouter", "openai", "google", "gemini", "groq", "grok", "anthropic"];

type BrainStatusIntegrationRow = {
  provider: string | null;
  instance_name: string | null;
  status: string | null;
  api_key_secret_id: string | null;
};

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(label)), timeoutMs);
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function resolveProviderFromSettings(aiFeatures: Record<string, unknown>): LLMProvider | null {
  return normalizeLLMProvider(
    String(
      aiFeatures.brain_provider ||
      aiFeatures.default_brain_provider ||
      aiFeatures.primary_llm_provider ||
      aiFeatures.default_llm_provider ||
      ""
    )
  );
}

export async function GET() {
  try {
    const auth = await withTimeout(getBrainAuthContext(), STATUS_QUERY_TIMEOUT_MS, "brain_auth_timeout");
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const [{ data: settings }, { data: integrations, error: integrationsError }] = await withTimeout(Promise.all([
      brainAdminSupabase
        .from("tenant_settings")
        .select("ai_features")
        .eq("tenant_id", auth.context.tenantId)
        .maybeSingle(),
      brainAdminSupabase
        .from("tenant_integrations")
        .select("provider, instance_name, status, api_key_secret_id")
        .eq("tenant_id", auth.context.tenantId)
        .in("provider", INTEGRATION_PROVIDERS),
    ]), STATUS_QUERY_TIMEOUT_MS, "brain_status_timeout");

    if (integrationsError) {
      throw integrationsError;
    }

    const aiFeatures = (settings?.ai_features as Record<string, unknown> | null) || {};
    const preferredProvider = resolveProviderFromSettings(aiFeatures);

    const availableProviders = ((integrations || []) as BrainStatusIntegrationRow[]).reduce<Array<{ provider: LLMProvider; model: string }>>((acc, integration) => {
      const provider = normalizeLLMProvider(integration.provider);
      const hasApiKey = Boolean(String(integration.api_key_secret_id || "").trim());
      const status = String(integration.status || "").trim().toLowerCase();

      if (!provider || !hasApiKey || (status && status !== "connected")) {
        return acc;
      }

      const model = String(integration.instance_name || "").trim() || getDefaultModelForUseCase(provider, "chat_geral");
      const existingIndex = acc.findIndex((item) => item.provider === provider);

      if (existingIndex >= 0) {
        acc[existingIndex] = { provider, model };
      } else {
        acc.push({ provider, model });
      }

      return acc;
    }, []);

    const defaultProvider = preferredProvider && availableProviders.some((item) => item.provider === preferredProvider)
      ? preferredProvider
      : PRIORITY.find((provider) => availableProviders.some((item) => item.provider === provider)) || null;

    const defaultEntry = availableProviders.find((item) => item.provider === defaultProvider) || null;

    return NextResponse.json({
      configured: availableProviders.length > 0,
      default_provider: defaultEntry?.provider || null,
      default_model: defaultEntry?.model || null,
      available_providers: availableProviders,
    });
  } catch (error) {
    console.error("[brain/status] fatal", error);
    const isTimeout = error instanceof Error && /timeout/i.test(error.message);
    return NextResponse.json(
      { error: isTimeout ? "Tempo esgotado ao acessar o cofre de chaves." : "Erro interno ao carregar status do cerebro." },
      { status: isTimeout ? 503 : 500 }
    );
  }
}
