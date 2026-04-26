export type SafeTenantIntegration = {
  id: string;
  tenant_id: string;
  provider: string;
  status: string | null;
  instance_name: string | null;
  display_name: string | null;
  webhook_url: string | null;
  updated_at: string | null;
  has_api_key: boolean;
  has_webhook_secret: boolean;
};

type FetchSafeIntegrationsOptions = {
  providers?: string[];
  signal?: AbortSignal;
};

export async function fetchSafeIntegrations(options?: FetchSafeIntegrationsOptions): Promise<SafeTenantIntegration[]> {
  const searchParams = new URLSearchParams();

  if (options?.providers && options.providers.length > 0) {
    searchParams.set("providers", options.providers.join(","));
  }

  const suffix = searchParams.toString();
  const response = await fetch(`/api/integrations${suffix ? `?${suffix}` : ""}`, {
    cache: "no-store",
    signal: options?.signal,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Nao foi possivel carregar as integracoes do escritorio.");
  }

  return Array.isArray(payload?.integrations) ? (payload.integrations as SafeTenantIntegration[]) : [];
}
