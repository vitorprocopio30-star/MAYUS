import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processPendingWhatsAppMediaBatch } from "@/lib/whatsapp/media-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function normalizeLimit(value: string | null) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV !== "production") return true;
  if (!secret) return false;
  const cronHeader = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return cronHeader === secret || bearer === secret;
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const limit = normalizeLimit(request.nextUrl.searchParams.get("limit"));
  const messageId = request.nextUrl.searchParams.get("message_id")?.trim() || null;

  try {
    const result = await processPendingWhatsAppMediaBatch({
      supabase: adminSupabase,
      limit,
      messageId,
    });

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      ...result,
    });
  } catch (error: any) {
    console.error("[whatsapp-media-process] fatal", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar midias WhatsApp." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
