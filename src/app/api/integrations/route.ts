import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { listTenantIntegrationsSafe, upsertTenantIntegrationSecure } from "@/lib/integrations/server";

export const dynamic = "force-dynamic";

function parseProviders(searchParam: string | null) {
  return Array.from(
    new Set(
      String(searchParam || "")
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();
    const providers = parseProviders(request.nextUrl.searchParams.get("providers"));
    const integrations = await listTenantIntegrationsSafe(tenantId, providers);

    return NextResponse.json({
      integrations: integrations.map((integration) => ({
        id: integration.id,
        tenant_id: integration.tenant_id,
        provider: integration.provider,
        status: integration.status,
        instance_name: integration.instance_name,
        display_name: integration.display_name,
        webhook_url: integration.webhook_url,
        updated_at: integration.updated_at || null,
        has_api_key: Boolean(integration.has_api_key),
        has_webhook_secret: Boolean(integration.has_webhook_secret),
      })),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (error.message === "TenantNotFound") {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    return NextResponse.json({ error: "Nao foi possivel carregar as integracoes do escritorio." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession({ requireFullAccess: true });
    const body = await request.json().catch(() => null);

    const provider = String(body?.provider || "").trim();
    if (!provider) {
      return NextResponse.json({ error: "Provider invalido." }, { status: 400 });
    }

    const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : null;

    const integration = await upsertTenantIntegrationSecure({
      tenantId,
      provider,
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : null,
      webhookSecret: typeof body?.webhookSecret === "string" ? body.webhookSecret : null,
      instanceName: typeof body?.instanceName === "string" ? body.instanceName : null,
      status: typeof body?.status === "string" ? body.status : null,
      displayName: typeof body?.displayName === "string" ? body.displayName : null,
      webhookUrl: typeof body?.webhookUrl === "string" ? body.webhookUrl : null,
      metadata,
      clearApiKey: body?.clearApiKey === true,
      clearWebhookSecret: body?.clearWebhookSecret === true,
    });

    return NextResponse.json({
      integration: integration
        ? {
            id: integration.id,
            tenant_id: integration.tenant_id,
            provider: integration.provider,
            status: integration.status,
            instance_name: integration.instance_name,
            display_name: integration.display_name,
            webhook_url: integration.webhook_url,
            updated_at: integration.updated_at || null,
            has_api_key: Boolean(String(integration.api_key || "").trim() || integration.api_key_secret_id),
            has_webhook_secret: Boolean(String(integration.webhook_secret || "").trim() || integration.webhook_secret_secret_id),
          }
        : null,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }

    if (error.message === "TenantNotFound") {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    return NextResponse.json({ error: error?.message || "Nao foi possivel salvar a integracao." }, { status: 500 });
  }
}
