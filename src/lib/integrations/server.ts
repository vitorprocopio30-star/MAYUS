import { supabaseAdmin } from "@/lib/supabase/admin";

export type ResolvedTenantIntegration = {
  id: string;
  tenant_id: string;
  provider: string;
  api_key: string | null;
  webhook_secret: string | null;
  webhook_url: string | null;
  instance_name: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  display_name: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  api_key_secret_id?: string | null;
  webhook_secret_secret_id?: string | null;
};

export type UpsertTenantIntegrationSecureInput = {
  tenantId: string;
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

function normalizeSafeIntegration(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  const apiKey = typeof row.api_key === "string" ? row.api_key : null;
  const webhookSecret = typeof row.webhook_secret === "string" ? row.webhook_secret : null;

  return {
    id: String(row.id || ""),
    tenant_id: String(row.tenant_id || ""),
    provider: String(row.provider || ""),
    status: typeof row.status === "string" ? row.status : null,
    instance_name: typeof row.instance_name === "string" ? row.instance_name : null,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    webhook_url: typeof row.webhook_url === "string" ? row.webhook_url : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    has_api_key: Boolean(String(apiKey || "").trim() || row.api_key_secret_id),
    has_webhook_secret: Boolean(String(webhookSecret || "").trim() || row.webhook_secret_secret_id),
  };
}

function normalizeResolvedIntegration(row: Record<string, unknown> | null | undefined): ResolvedTenantIntegration | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    tenant_id: String(row.tenant_id || ""),
    provider: String(row.provider || ""),
    api_key: typeof row.api_key === "string" ? row.api_key : null,
    webhook_secret: typeof row.webhook_secret === "string" ? row.webhook_secret : null,
    webhook_url: typeof row.webhook_url === "string" ? row.webhook_url : null,
    instance_name: typeof row.instance_name === "string" ? row.instance_name : null,
    status: typeof row.status === "string" ? row.status : null,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    api_key_secret_id: typeof row.api_key_secret_id === "string" ? row.api_key_secret_id : null,
    webhook_secret_secret_id: typeof row.webhook_secret_secret_id === "string" ? row.webhook_secret_secret_id : null,
  };
}

export async function getTenantIntegrationResolved(tenantId: string, provider: string): Promise<ResolvedTenantIntegration | null> {
  const rpcResult = await supabaseAdmin.rpc("get_tenant_integration_resolved", {
    p_tenant_id: tenantId,
    p_provider: provider,
  });

  if (rpcResult.error) {
    throw rpcResult.error;
  }

  const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] ?? null : rpcResult.data;
  return normalizeResolvedIntegration((row as Record<string, unknown> | null | undefined) ?? null);
}

export async function listTenantIntegrationsResolved(tenantId: string, providers?: string[]): Promise<ResolvedTenantIntegration[]> {
  const normalizedProviders = Array.isArray(providers) && providers.length > 0 ? providers : null;
  const rpcResult = await supabaseAdmin.rpc("list_tenant_integrations_resolved", {
    p_tenant_id: tenantId,
    p_providers: normalizedProviders,
  });

  if (rpcResult.error) {
    throw rpcResult.error;
  }

  return Array.isArray(rpcResult.data)
    ? rpcResult.data.map((row) => normalizeResolvedIntegration(row as Record<string, unknown>)!).filter(Boolean)
    : [];
}

export async function requireTenantApiKey(tenantId: string, provider: string) {
  const integration = await getTenantIntegrationResolved(tenantId, provider);
  const apiKey = String(integration?.api_key || "").trim();
  return {
    integration,
    apiKey: apiKey || null,
  };
}

export async function upsertTenantIntegrationSecure(input: UpsertTenantIntegrationSecureInput) {
  const { data, error } = await supabaseAdmin.rpc("upsert_tenant_integration_secure", {
    p_tenant_id: input.tenantId,
    p_provider: input.provider,
    p_api_key: input.apiKey ?? null,
    p_webhook_secret: input.webhookSecret ?? null,
    p_instance_name: input.instanceName ?? null,
    p_status: input.status ?? null,
    p_display_name: input.displayName ?? null,
    p_webhook_url: input.webhookUrl ?? null,
    p_metadata: input.metadata ?? null,
    p_clear_api_key: input.clearApiKey === true,
    p_clear_webhook_secret: input.clearWebhookSecret === true,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function listTenantIntegrationsSafe(tenantId: string, providers?: string[]) {
  const normalizedProviders = Array.isArray(providers) && providers.length > 0 ? providers : null;

  const rpcResult = await supabaseAdmin.rpc("list_tenant_integrations_resolved", {
    p_tenant_id: tenantId,
    p_providers: normalizedProviders,
  });

  if (rpcResult.error) {
    throw rpcResult.error;
  }

  return Array.isArray(rpcResult.data)
    ? rpcResult.data.map((row) => normalizeSafeIntegration(row as Record<string, unknown>)!).filter(Boolean)
    : [];
}
