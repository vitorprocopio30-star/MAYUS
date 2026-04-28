import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantIntegrationResolved, upsertTenantIntegrationSecure } from "@/lib/integrations/server";
import {
  fetchGoogleCalendarEvents,
  getGoogleCalendarIntegrationMetadata,
  getGoogleCalendarProviderForUser,
  isGoogleCalendarConfigured,
  mergeGoogleCalendarMetadata,
  needsGoogleCalendarTokenRefresh,
  refreshGoogleCalendarAccessToken,
  revokeGoogleCalendarRefreshToken,
  sanitizeGoogleCalendarState,
} from "@/lib/services/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const { tenantId, userId } = await getTenantSession();

    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json({
        available: false,
        connected: false,
        status: "unavailable",
        connectedEmail: null,
        events: [],
      });
    }

    const provider = getGoogleCalendarProviderForUser(userId);
    const integration = await getTenantIntegrationResolved(tenantId, provider);

    if (!integration?.api_key || integration.status !== "connected") {
      return NextResponse.json(sanitizeGoogleCalendarState(integration));
    }

    let metadata = getGoogleCalendarIntegrationMetadata(integration);
    let accessToken = metadata.access_token || "";

    if (!accessToken || needsGoogleCalendarTokenRefresh(metadata.expires_at)) {
      const refreshed = await refreshGoogleCalendarAccessToken(request, integration.api_key);
      metadata = mergeGoogleCalendarMetadata(metadata, {
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        scope: refreshed.scope || metadata.scope || null,
        token_type: refreshed.tokenType || metadata.token_type || null,
      });
      accessToken = refreshed.accessToken;

      await upsertTenantIntegrationSecure({
        tenantId,
        provider,
        apiKey: integration.api_key,
        status: "connected",
        displayName: "Google Agenda pessoal",
        metadata,
      });
    }

    const date = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const events = await fetchGoogleCalendarEvents(accessToken, date);

    return NextResponse.json(sanitizeGoogleCalendarState({ ...integration, metadata }, events));
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao carregar Google Agenda." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { tenantId, userId } = await getTenantSession();
    const provider = getGoogleCalendarProviderForUser(userId);
    const integration = await getTenantIntegrationResolved(tenantId, provider);

    if (!integration?.id) {
      return NextResponse.json({ success: true });
    }

    await revokeGoogleCalendarRefreshToken(integration.api_key || "");

    const metadata = mergeGoogleCalendarMetadata(integration.metadata, {
      access_token: null,
      connected_email: null,
      expires_at: null,
      scope: null,
      token_type: null,
    });

    await upsertTenantIntegrationSecure({
      tenantId,
      provider,
      status: "disconnected",
      displayName: "Google Agenda pessoal",
      metadata,
      clearApiKey: true,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    return NextResponse.json({ error: "Erro ao desconectar Google Agenda." }, { status: 500 });
  }
}
