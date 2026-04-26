import { NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import {
  getDefaultModelForUseCase,
  normalizeLLMProvider,
  type LLMProvider,
} from "@/lib/llm-router";

export const dynamic = "force-dynamic";

const PRIORITY: readonly LLMProvider[] = ["openrouter", "openai", "google", "groq", "anthropic"];

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
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const [{ data: settings }, integrations] = await Promise.all([
      brainAdminSupabase
        .from("tenant_settings")
        .select("ai_features")
        .eq("tenant_id", auth.context.tenantId)
        .maybeSingle(),
      listTenantIntegrationsResolved(auth.context.tenantId, ["openrouter", "openai", "google", "gemini", "groq", "grok", "anthropic"]),
    ]);

    const aiFeatures = (settings?.ai_features as Record<string, unknown> | null) || {};
    const preferredProvider = resolveProviderFromSettings(aiFeatures);

    const availableProviders = (integrations || []).reduce<Array<{ provider: LLMProvider; model: string }>>((acc, integration) => {
      const provider = normalizeLLMProvider(integration.provider);
      const apiKey = String(integration.api_key || "").trim();
      const status = String(integration.status || "").trim().toLowerCase();

      if (!provider || !apiKey || (status && status !== "connected")) {
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
    return NextResponse.json({ error: "Erro interno ao carregar status do cerebro." }, { status: 500 });
  }
}
