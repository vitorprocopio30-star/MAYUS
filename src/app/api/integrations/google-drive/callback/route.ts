import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { upsertTenantIntegrationSecure, getTenantIntegrationResolved } from "@/lib/integrations/server";
import {
  exchangeGoogleDriveCode,
  getGoogleDriveIntegrationMetadata,
  GOOGLE_DRIVE_PROVIDER,
  GOOGLE_DRIVE_STATE_COOKIE,
  mergeGoogleDriveMetadata,
} from "@/lib/services/google-drive";
import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";

function buildIntegrationsRedirect(request: Request, status: "connected" | "error", message?: string) {
  const url = new URL("/dashboard/configuracoes/integracoes", resolvePublicAppUrl(request));
  url.searchParams.set("googleDrive", status);
  if (message) {
    url.searchParams.set("message", message.slice(0, 240));
  }
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_DRIVE_STATE_COOKIE)?.value || null;
  cookieStore.delete(GOOGLE_DRIVE_STATE_COOKIE);

  try {
    if (oauthError) {
      throw new Error("A autorização do Google foi cancelada ou negada.");
    }

    if (!state || !expectedState || state !== expectedState) {
      throw new Error("Não foi possível validar o retorno do Google Drive.");
    }

    if (!code) {
      throw new Error("Código de autorização do Google Drive ausente.");
    }

    const { tenantId } = await getTenantSession({ requireFullAccess: true });
    const existingIntegration = await getTenantIntegrationResolved(tenantId, GOOGLE_DRIVE_PROVIDER);

    const tokenData = await exchangeGoogleDriveCode(request, code);
    const refreshToken = tokenData.refreshToken || existingIntegration?.api_key || null;

    if (!refreshToken) {
      throw new Error("O Google não retornou o token permanente. Revogue o acesso do app e conecte novamente.");
    }

    const currentMetadata = getGoogleDriveIntegrationMetadata(existingIntegration);
    const metadata = mergeGoogleDriveMetadata(existingIntegration?.metadata, {
      access_token: tokenData.accessToken,
      connected_email: tokenData.connectedEmail || currentMetadata.connected_email || null,
      expires_at: tokenData.expiresAt,
      scope: tokenData.scope || currentMetadata.scope || null,
      token_type: tokenData.tokenType || currentMetadata.token_type || null,
    });

    await upsertTenantIntegrationSecure({
      tenantId,
      provider: GOOGLE_DRIVE_PROVIDER,
      apiKey: refreshToken,
      status: "connected",
      metadata,
    });

    return NextResponse.redirect(buildIntegrationsRedirect(request, "connected"));
  } catch (error: any) {
    console.error("[google-drive][callback]", error);

    if (error.message === "Unauthorized") {
      return NextResponse.redirect(new URL("/login", resolvePublicAppUrl(request)));
    }

    if (error.message === "Forbidden") {
      return NextResponse.redirect(
        buildIntegrationsRedirect(request, "error", "Apenas administradores podem conectar o Google Drive.")
      );
    }

    return NextResponse.redirect(
      buildIntegrationsRedirect(
        request,
        "error",
        error?.message || "Não foi possível concluir a conexão com o Google Drive."
      )
    );
  }
}
