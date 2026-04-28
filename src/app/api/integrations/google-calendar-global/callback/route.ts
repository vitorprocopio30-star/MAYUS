import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantIntegrationResolved, upsertTenantIntegrationSecure } from "@/lib/integrations/server";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarGlobalProvider,
  getGoogleCalendarIntegrationMetadata,
  GOOGLE_CALENDAR_GLOBAL_CALLBACK_PATH,
  GOOGLE_CALENDAR_GLOBAL_STATE_COOKIE,
  mergeGoogleCalendarMetadata,
} from "@/lib/services/google-calendar";
import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";

function buildAgendaGlobalRedirect(request: Request, status: "connected" | "error", message?: string) {
  const url = new URL("/dashboard/agenda-global", resolvePublicAppUrl(request));
  url.searchParams.set("googleCalendarGlobal", status);
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
  const expectedState = cookieStore.get(GOOGLE_CALENDAR_GLOBAL_STATE_COOKIE)?.value || null;
  cookieStore.delete(GOOGLE_CALENDAR_GLOBAL_STATE_COOKIE);

  try {
    if (oauthError) {
      throw new Error("A autorização do Google foi cancelada ou negada.");
    }

    if (!state || !expectedState || state !== expectedState) {
      throw new Error("Não foi possível validar o retorno do Google Agenda global.");
    }

    if (!code) {
      throw new Error("Código de autorização do Google Agenda global ausente.");
    }

    const { tenantId } = await getTenantSession({ requireFullAccess: true });
    const provider = getGoogleCalendarGlobalProvider();
    const existingIntegration = await getTenantIntegrationResolved(tenantId, provider);
    const tokenData = await exchangeGoogleCalendarCode(request, code, GOOGLE_CALENDAR_GLOBAL_CALLBACK_PATH);
    const refreshToken = tokenData.refreshToken || existingIntegration?.api_key || null;

    if (!refreshToken) {
      throw new Error("O Google não retornou o token permanente. Revogue o acesso do app e conecte novamente.");
    }

    const currentMetadata = getGoogleCalendarIntegrationMetadata(existingIntegration);
    const metadata = mergeGoogleCalendarMetadata(existingIntegration?.metadata, {
      access_token: tokenData.accessToken,
      connected_email: tokenData.connectedEmail || currentMetadata.connected_email || null,
      expires_at: tokenData.expiresAt,
      scope: tokenData.scope || currentMetadata.scope || null,
      token_type: tokenData.tokenType || currentMetadata.token_type || null,
    });

    await upsertTenantIntegrationSecure({
      tenantId,
      provider,
      apiKey: refreshToken,
      status: "connected",
      displayName: "Google Agenda global",
      metadata,
    });

    return NextResponse.redirect(buildAgendaGlobalRedirect(request, "connected"));
  } catch (error: any) {
    console.error("[google-calendar-global][callback]", error);

    if (error.message === "Unauthorized") {
      return NextResponse.redirect(new URL("/login", resolvePublicAppUrl(request)));
    }

    if (error.message === "Forbidden") {
      return NextResponse.redirect(
        buildAgendaGlobalRedirect(request, "error", "Apenas administradores podem conectar a agenda global.")
      );
    }

    return NextResponse.redirect(
      buildAgendaGlobalRedirect(
        request,
        "error",
        error?.message || "Não foi possível concluir a conexão com o Google Agenda global."
      )
    );
  }
}
