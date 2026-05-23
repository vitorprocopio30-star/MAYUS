import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { recordLearningEvent } from "@/lib/agent/memory/learning-events";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthenticatedTenant() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    },
  );

  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return { error: "Nao autorizado.", status: 401 as const };

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle<{ tenant_id: string | null }>();

  if (profileError || !profile?.tenant_id) {
    return { error: "Perfil ou tenant nao vinculados.", status: 403 as const };
  }

  return { tenantId: profile.tenant_id, userId: user.id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 10);
}

function normalizeTextForDelta(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripWhatsAppSignature(value: unknown) {
  const text = String(value || "").trim();
  return text.replace(/^\*[^*\n]{1,80}\*\s*\n{1,3}/, "").trim();
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeTextForDelta(left).split(/\s+/).filter(Boolean));
  const rightTokens = new Set(normalizeTextForDelta(right).split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...Array.from(leftTokens), ...Array.from(rightTokens)]).size || 1;
  return Number((intersection / union).toFixed(4));
}

function wordCount(value: string) {
  return normalizeTextForDelta(value).split(/\s+/).filter(Boolean).length;
}

function buildHumanReplyDeltaPayload(params: {
  contactId: string;
  sentText: unknown;
  provider: string | null;
  messageId: string | null | undefined;
  draftContext: unknown;
}) {
  if (!isRecord(params.draftContext)) return null;
  const suggestedReply = getString(params.draftContext.suggested_reply);
  const sentText = stripWhatsAppSignature(params.sentText);
  if (!suggestedReply || !sentText) return null;

  const sentNormalized = normalizeTextForDelta(sentText);
  const suggestedNormalized = normalizeTextForDelta(suggestedReply);
  const similarity = tokenSimilarity(sentText, suggestedReply);
  const conversationState = isRecord(params.draftContext.conversation_state)
    ? params.draftContext.conversation_state
    : isRecord(params.draftContext.mayus_operating_partner)
      && isRecord(params.draftContext.mayus_operating_partner.conversation_state)
      ? params.draftContext.mayus_operating_partner.conversation_state
      : {};
  const supportSummary = isRecord(params.draftContext.support_summary)
    ? params.draftContext.support_summary
    : isRecord(params.draftContext.mayus_operating_partner)
      && isRecord(params.draftContext.mayus_operating_partner.support_summary)
      ? params.draftContext.mayus_operating_partner.support_summary
      : {};
  const riskFlags = getStringArray(params.draftContext.risk_flags);
  const editCategories = new Set<string>();
  if (sentNormalized === suggestedNormalized) editCategories.add("sent_as_suggested");
  if (sentNormalized !== suggestedNormalized) editCategories.add("human_edited");
  if (similarity < 0.6) editCategories.add("substantive_edit");
  if (sentText.length < suggestedReply.length * 0.75) editCategories.add("shortened");
  if (sentText.length > suggestedReply.length * 1.25) editCategories.add("expanded");
  if (params.draftContext.requires_human_review === true) editCategories.add("risk_reviewed");
  if (
    getString(conversationState.stage) === "objection"
    || getString(params.draftContext.intent)?.includes("objection")
    || riskFlags.some((flag) => /billing|contract|price|preco|valor|objection/i.test(flag))
  ) {
    editCategories.add("objection_handled");
  }

  return {
    contact_id: params.contactId,
    provider: params.provider,
    provider_message_id: params.messageId || null,
    reply_source: getString(params.draftContext.reply_source),
    model_used: getString(params.draftContext.model_used),
    mode: getString(params.draftContext.mode),
    intent: getString(params.draftContext.intent)
      || (isRecord(params.draftContext.mayus_operating_partner) ? getString(params.draftContext.mayus_operating_partner.intent) : null),
    conversation_stage: getString(conversationState.stage),
    conversation_role: getString(conversationState.conversation_role),
    support_issue_type: getString(supportSummary.issue_type),
    risk_flags: riskFlags,
    may_auto_send: getBoolean(params.draftContext.may_auto_send),
    requires_human_review: getBoolean(params.draftContext.requires_human_review),
    suggested_char_count: suggestedReply.length,
    sent_char_count: sentText.length,
    char_delta: sentText.length - suggestedReply.length,
    suggested_word_count: wordCount(suggestedReply),
    sent_word_count: wordCount(sentText),
    word_delta: wordCount(sentText) - wordCount(suggestedReply),
    token_similarity: similarity,
    edit_categories: Array.from(editCategories),
  };
}

// Rota segura server-side de disparo do MAYUS.
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedTenant();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      contact_id,
      text,
      audio_url,
      media_url,
      media_type,
      media_filename,
      media_mime_type,
      media_storage_path,
      preferred_provider,
      mayus_draft_context,
    } = body;

    const contactId = typeof contact_id === "string" && contact_id.trim() ? contact_id.trim() : null;
    if (!contactId) {
      return NextResponse.json({ error: "contact_id obrigatorio." }, { status: 400 });
    }

    const { data: contact, error: contactError } = await adminSupabase
      .from("whatsapp_contacts")
      .select("id, phone_number")
      .eq("tenant_id", auth.tenantId)
      .eq("id", contactId)
      .maybeSingle<{ id: string; phone_number: string | null }>();

    if (contactError) throw contactError;
    if (!contact?.phone_number) {
      return NextResponse.json({ error: "Contato nao encontrado." }, { status: 404 });
    }

    const result = await sendWhatsAppMessage({
      supabase: adminSupabase,
      tenantId: auth.tenantId,
      contactId,
      phoneNumber: contact.phone_number,
      preferredProvider: preferred_provider === "meta_cloud" || preferred_provider === "evolution" ? preferred_provider : null,
      text,
      audioUrl: audio_url,
      mediaUrl: media_url,
      mediaType: media_type,
      mediaFilename: media_filename,
      mediaMimeType: media_mime_type,
      mediaStoragePath: media_storage_path,
      metadata: audio_url
        ? { source: "manual_audio_send" }
        : media_url
          ? { source: "manual_media_send" }
          : { source: "manual_whatsapp_send" },
    });

    const humanReplyDeltaPayload = buildHumanReplyDeltaPayload({
      contactId,
      sentText: text,
      provider: result.provider,
      messageId: result.messageId,
      draftContext: mayus_draft_context,
    });

    if (humanReplyDeltaPayload) {
      await recordLearningEvent({
        supabase: adminSupabase,
        tenantId: auth.tenantId,
        eventType: "whatsapp_human_reply_delta_recorded",
        sourceModule: "whatsapp_manual_send",
        createdBy: auth.userId,
        payload: humanReplyDeltaPayload,
      });
    }

    return NextResponse.json({
      success: true,
      motor: result.provider,
      apiResponse: result.apiResponse,
    });
  } catch (err: any) {
    const message = err?.message || "Erro no envio de WhatsApp";
    console.error("Erro no Envio de WhatsApp:", err);
    const status = message.includes("Faltam parametros") ? 400 : message.includes("Nenhuma integracao") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
