type SaveTenantIntegrationPayload = {
  provider: string;
  apiKey?: string | null;
  webhookSecret?: string | null;
  instanceName?: string | null;
  status?: string | null;
  displayName?: string | null;
  webhookUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  clearApiKey?: boolean;
  clearWebhookSecret?: boolean;
};

export async function saveTenantIntegration(payload: SaveTenantIntegrationPayload) {
  const response = await fetch("/api/integrations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || "Nao foi possivel salvar a integracao.");
  }

  return body?.integration ?? null;
}
