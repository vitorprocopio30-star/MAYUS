import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenantIntegrationResolved } from "@/lib/integrations/server";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type InstagramIntegrationRow = {
  tenant_id: string;
  provider: string;
  instance_name: string | null;
  metadata: Record<string, unknown> | null;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function metadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = normalizeText(metadata?.[key]);
    if (value) return value;
  }
  return "";
}

function buildDeliveryMessage(automation: Record<string, any>) {
  const directMessage = normalizeText(automation.direct_message);
  const fileUrl = normalizeText(automation.file_url);
  return [directMessage, fileUrl ? `Acesse aqui: ${fileUrl}` : null].filter(Boolean).join("\n\n");
}

function matchesKeyword(commentText: string, keyword: string) {
  const normalizedComment = commentText.toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  return Boolean(normalizedKeyword) && normalizedComment.includes(normalizedKeyword);
}

function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  if (signatureHeader.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}

async function resolveInstagramIntegration(instagramBusinessId: string) {
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("tenant_id, provider, instance_name, metadata")
    .in("provider", ["instagram", "meta_instagram", "meta_cloud"]);

  if (error) throw error;

  const rows = (data || []) as InstagramIntegrationRow[];
  return rows.find((row) => {
    const metadataBusinessId = metadataString(row.metadata, [
      "instagram_business_account_id",
      "instagram_business_id",
      "ig_business_account_id",
      "ig_user_id",
    ]);
    if (metadataBusinessId === instagramBusinessId) return true;

    const instanceParts = normalizeText(row.instance_name).split("|").map((part) => part.trim()).filter(Boolean);
    return instanceParts.includes(instagramBusinessId);
  }) || null;
}

async function recordWebhookEvent(params: {
  tenantId: string | null;
  instagramBusinessId: string;
  providerEventId: string;
  commentId: string | null;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabase.from("instagram_webhook_events").insert({
    tenant_id: params.tenantId,
    instagram_business_id: params.instagramBusinessId,
    provider_event_id: params.providerEventId,
    comment_id: params.commentId,
    status: "received",
    payload: params.payload,
  });

  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function updateWebhookEvent(providerEventId: string, values: Record<string, unknown>) {
  await supabase
    .from("instagram_webhook_events")
    .update(values)
    .eq("provider_event_id", providerEventId);
}

async function postPublicReply(params: { commentId: string; accessToken: string; message: string }) {
  return fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(params.commentId)}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      access_token: params.accessToken,
    }),
  });
}

async function sendPrivateReply(params: { instagramBusinessId: string; commentId: string; accessToken: string; message: string }) {
  return fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(params.instagramBusinessId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: params.commentId },
      message: { text: params.message },
      access_token: params.accessToken,
    }),
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  let providerEventId = "";

  try {
    const rawBody = await req.text();
    if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ success: false, error: "invalid_signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody || "{}");
    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
      const instagramBusinessId = normalizeText(entry?.id);
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      if (!instagramBusinessId || changes.length === 0) continue;

      const integration = await resolveInstagramIntegration(instagramBusinessId);
      if (!integration) {
        console.warn(`[Instagram Webhook] Integracao nao encontrada para Instagram Business ID ${instagramBusinessId}.`);
        continue;
      }

      const tenantId = integration.tenant_id;
      const resolvedIntegration = await getTenantIntegrationResolved(tenantId, integration.provider);
      const accessToken = normalizeText(resolvedIntegration?.api_key);
      if (!accessToken) {
        console.warn(`[Instagram Webhook] Token ausente para tenant ${tenantId} provider ${integration.provider}.`);
        continue;
      }

      for (const change of changes) {
        if (change?.field !== "comments") continue;

        const value = change.value || {};
        const commentText = normalizeText(value.text);
        const commentId = normalizeText(value.id);
        providerEventId = normalizeText(value.id || value.comment_id || `${instagramBusinessId}:${commentText}`);
        if (!commentText || !commentId || !providerEventId) continue;

        const inserted = await recordWebhookEvent({
          tenantId,
          instagramBusinessId,
          providerEventId,
          commentId,
          payload: { entry_id: instagramBusinessId, change },
        });
        if (!inserted) continue;

        const { data: automations, error } = await supabase
          .from("instagram_automations")
          .select("id, keyword, response_text, direct_message, file_url")
          .eq("tenant_id", tenantId)
          .eq("is_active", true);

        if (error) throw error;

        const automation = (automations || []).find((item: any) => matchesKeyword(commentText, item.keyword));
        if (!automation) {
          console.info(`[Instagram Webhook] Comentario ${commentId} sem automacao correspondente.`);
          await updateWebhookEvent(providerEventId, { status: "ignored_no_keyword" });
          continue;
        }

        const responseText = normalizeText(automation.response_text) || "Te enviei no direct.";
        const directText = buildDeliveryMessage(automation);

        const publicReply = await postPublicReply({ commentId, accessToken, message: responseText });
        if (!publicReply.ok) {
          throw new Error(`Falha ao responder comentario no Instagram: ${publicReply.status}`);
        }

        if (directText) {
          const privateReply = await sendPrivateReply({ instagramBusinessId, commentId, accessToken, message: directText });
          if (!privateReply.ok) {
            throw new Error(`Falha ao enviar direct no Instagram: ${privateReply.status}`);
          }
        }

        await updateWebhookEvent(providerEventId, {
          status: "sent",
          automation_id: automation.id,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Instagram Webhook] Erro:", error);
    if (providerEventId) {
      await updateWebhookEvent(providerEventId, {
        status: "error",
        error_message: error?.message || "Erro desconhecido",
      });
    }
    return NextResponse.json({ success: true });
  }
}
