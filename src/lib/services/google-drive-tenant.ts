import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getGoogleDriveIntegrationMetadata,
  GOOGLE_DRIVE_PROVIDER,
  isGoogleDriveConfigured,
  mergeGoogleDriveMetadata,
  needsGoogleDriveTokenRefresh,
  refreshGoogleDriveAccessToken,
  type GoogleDriveIntegrationMetadata,
} from "@/lib/services/google-drive";

type TenantIntegrationRecord = {
  id: string;
  api_key: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
};

export type TenantGoogleDriveContext = {
  integrationId: string;
  refreshToken: string;
  accessToken: string;
  metadata: GoogleDriveIntegrationMetadata;
};

export async function getTenantGoogleDriveContext(
  request: Request,
  tenantId: string
): Promise<TenantGoogleDriveContext> {
  if (!isGoogleDriveConfigured()) {
    throw new Error("GoogleDriveNotConfigured");
  }

  const { data: integration, error } = await supabaseAdmin
    .from("tenant_integrations")
    .select("id, api_key, status, metadata")
    .eq("tenant_id", tenantId)
    .eq("provider", GOOGLE_DRIVE_PROVIDER)
    .maybeSingle<TenantIntegrationRecord>();

  if (error) {
    throw error;
  }

  if (!integration?.id || !integration.api_key || integration.status !== "connected") {
    throw new Error("GoogleDriveDisconnected");
  }

  let metadata = getGoogleDriveIntegrationMetadata(integration);
  let accessToken = metadata.access_token || "";

  if (!accessToken || needsGoogleDriveTokenRefresh(metadata.expires_at)) {
    const refreshed = await refreshGoogleDriveAccessToken(request, integration.api_key);
    metadata = mergeGoogleDriveMetadata(metadata, {
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
      scope: refreshed.scope || metadata.scope || null,
      token_type: refreshed.tokenType || metadata.token_type || null,
    });

    const { error: updateError } = await supabaseAdmin
      .from("tenant_integrations")
      .update({ metadata })
      .eq("id", integration.id);

    if (updateError) {
      throw updateError;
    }

    accessToken = refreshed.accessToken;
  }

  return {
    integrationId: integration.id,
    refreshToken: integration.api_key,
    accessToken,
    metadata,
  };
}
