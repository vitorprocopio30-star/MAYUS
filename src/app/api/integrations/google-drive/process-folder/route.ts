import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildProcessGoogleDriveFolderName,
  createGoogleDriveFolder,
  getGoogleDriveIntegrationMetadata,
  GOOGLE_DRIVE_PROVIDER,
  isGoogleDriveConfigured,
  mergeGoogleDriveMetadata,
  needsGoogleDriveTokenRefresh,
  refreshGoogleDriveAccessToken,
} from "@/lib/services/google-drive";

type ProcessTaskRecord = {
  id: string;
  tenant_id: string;
  title: string;
  client_name?: string | null;
  process_number?: string | null;
  drive_link?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: "Google Drive não configurado no servidor." }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const taskId = String(body?.taskId || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Processo inválido para criação de pasta." }, { status: 400 });
    }

    const { data: integration, error: integrationError } = await supabaseAdmin
      .from("tenant_integrations")
      .select("id, api_key, status, metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", GOOGLE_DRIVE_PROVIDER)
      .maybeSingle();

    if (integrationError) {
      throw integrationError;
    }

    if (!integration?.id || !integration.api_key || integration.status !== "connected") {
      return NextResponse.json(
        { error: "Conecte o Google Drive em Configurações > Integrações para gerar a pasta automaticamente." },
        { status: 400 }
      );
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("process_tasks")
      .select("id, tenant_id, title, client_name, process_number, drive_link")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .maybeSingle<ProcessTaskRecord>();

    if (taskError) {
      throw taskError;
    }

    if (!task) {
      return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
    }

    if (task.drive_link) {
      return NextResponse.json({ success: true, alreadyExists: true, task });
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

      const { error: tokenUpdateError } = await supabaseAdmin
        .from("tenant_integrations")
        .update({ metadata })
        .eq("id", integration.id);

      if (tokenUpdateError) {
        throw tokenUpdateError;
      }

      accessToken = refreshed.accessToken;
    }

    const folder = await createGoogleDriveFolder(accessToken, {
      name: buildProcessGoogleDriveFolderName(task),
      parentFolderId: metadata.drive_root_folder_id || null,
    });

    const { data: updatedTask, error: updateTaskError } = await supabaseAdmin
      .from("process_tasks")
      .update({ drive_link: folder.webViewLink })
      .eq("id", task.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updateTaskError) {
      throw updateTaskError;
    }

    return NextResponse.json({ success: true, folder, task: updatedTask });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao criar pasta automática no Google Drive." },
      { status: 500 }
    );
  }
}
