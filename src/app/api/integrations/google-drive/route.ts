import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildGoogleDriveFolderUrl,
  extractGoogleDriveFolderId,
  fetchGoogleDriveFolder,
  getGoogleDriveIntegrationMetadata,
  GOOGLE_DRIVE_PROVIDER,
  isGoogleDriveConfigured,
  mergeGoogleDriveMetadata,
  needsGoogleDriveTokenRefresh,
  refreshGoogleDriveAccessToken,
  revokeGoogleDriveRefreshToken,
  sanitizeGoogleDriveState,
} from "@/lib/services/google-drive";

export async function GET() {
  try {
    const { tenantId } = await getTenantSession({ requireFullAccess: true });

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({
        available: false,
        connected: false,
        status: "unavailable",
        connectedEmail: null,
        rootFolderId: null,
        rootFolderName: null,
        rootFolderUrl: null,
      });
    }

    const { data: integration, error } = await supabaseAdmin
      .from("tenant_integrations")
      .select("status, metadata, api_key")
      .eq("tenant_id", tenantId)
      .eq("provider", GOOGLE_DRIVE_PROVIDER)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json(sanitizeGoogleDriveState(integration));
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }

    return NextResponse.json({ error: "Erro ao carregar integração do Google Drive." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession({ requireFullAccess: true });

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: "Google Drive não configurado no servidor." }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const rootFolder = String(body?.rootFolder || "").trim();

    const { data: integration, error: integrationError } = await supabaseAdmin
      .from("tenant_integrations")
      .select("id, api_key, status, metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", GOOGLE_DRIVE_PROVIDER)
      .maybeSingle();

    if (integrationError) {
      throw integrationError;
    }

    if (!integration?.id) {
      return NextResponse.json({ error: "Conecte o Google Drive antes de definir a pasta raiz." }, { status: 400 });
    }

    if (!integration.api_key || integration.status !== "connected") {
      return NextResponse.json({ error: "Google Drive desconectado. Reconecte a conta primeiro." }, { status: 400 });
    }

    let metadata = getGoogleDriveIntegrationMetadata(integration);

    if (!rootFolder) {
      metadata = mergeGoogleDriveMetadata(integration.metadata, {
        drive_root_folder_id: null,
        drive_root_folder_name: null,
        drive_root_folder_url: null,
      });

      const { error: clearError } = await supabaseAdmin
        .from("tenant_integrations")
        .update({ metadata })
        .eq("id", integration.id);

      if (clearError) {
        throw clearError;
      }

      return NextResponse.json(
        sanitizeGoogleDriveState({
          status: integration.status,
          api_key: integration.api_key,
          metadata,
        })
      );
    }

    const folderId = extractGoogleDriveFolderId(rootFolder);
    if (!folderId) {
      return NextResponse.json({ error: "Informe um link ou ID válido de pasta do Google Drive." }, { status: 400 });
    }

    let accessToken = metadata.access_token || "";

    if (!accessToken || needsGoogleDriveTokenRefresh(metadata.expires_at)) {
      const refreshed = await refreshGoogleDriveAccessToken(request, integration.api_key);
      metadata = mergeGoogleDriveMetadata(metadata, {
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        scope: refreshed.scope || metadata.scope || null,
        token_type: refreshed.tokenType || metadata.token_type || null,
      });
      accessToken = refreshed.accessToken;
    }

    const folder = await fetchGoogleDriveFolder(accessToken, folderId);
    metadata = mergeGoogleDriveMetadata(metadata, {
      drive_root_folder_id: folder.id,
      drive_root_folder_name: folder.name || null,
      drive_root_folder_url: folder.webViewLink || buildGoogleDriveFolderUrl(folder.id),
    });

    const { error: updateError } = await supabaseAdmin
      .from("tenant_integrations")
      .update({ metadata })
      .eq("id", integration.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      sanitizeGoogleDriveState({
        status: integration.status,
        api_key: integration.api_key,
        metadata,
      })
    );
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar pasta raiz do Google Drive." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { tenantId } = await getTenantSession({ requireFullAccess: true });

    const { data: integration, error: integrationError } = await supabaseAdmin
      .from("tenant_integrations")
      .select("id, api_key, metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", GOOGLE_DRIVE_PROVIDER)
      .maybeSingle();

    if (integrationError) {
      throw integrationError;
    }

    if (!integration?.id) {
      return NextResponse.json({ success: true });
    }

    await revokeGoogleDriveRefreshToken(integration.api_key || "");

    const metadata = mergeGoogleDriveMetadata(integration.metadata, {
      access_token: null,
      connected_email: null,
      expires_at: null,
      scope: null,
      token_type: null,
    });

    const { error: updateError } = await supabaseAdmin
      .from("tenant_integrations")
      .update({
        api_key: null,
        status: "disconnected",
        metadata,
      })
      .eq("id", integration.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }

    return NextResponse.json({ error: "Erro ao desconectar Google Drive." }, { status: 500 });
  }
}
