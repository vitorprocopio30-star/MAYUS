import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { applyDriveDocumentScanActions } from "@/lib/services/drive-document-scanner";

export const runtime = "nodejs";

type ApplyBody = {
  scanRunId?: string | null;
  actionIds?: unknown;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeActionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, userId } = await getTenantSession();
    const body = (await request.json().catch(() => ({}))) as ApplyBody;
    const scanRunId = normalizeString(body.scanRunId);

    if (!scanRunId) {
      return NextResponse.json({ error: "Informe uma analise do Drive para aplicar." }, { status: 400 });
    }

    const driveContext = await getTenantGoogleDriveContext(request, tenantId);
    const result = await applyDriveDocumentScanActions({
      tenantId,
      userId,
      accessToken: driveContext.accessToken,
      scanRunId,
      actionIds: normalizeActionIds(body.actionIds),
      processRootFolderId: driveContext.metadata.drive_root_folder_id || null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (error?.message === "GoogleDriveDisconnected" || error?.message === "GoogleDriveNotConfigured") {
      return NextResponse.json({ error: "Google Drive nao conectado para este escritorio." }, { status: 400 });
    }

    if (error?.message === "DriveScanRunNotFound") {
      return NextResponse.json({ error: "Analise do Drive nao encontrada para este escritorio." }, { status: 404 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao aplicar organizacao do acervo do Drive." },
      { status: 500 }
    );
  }
}
