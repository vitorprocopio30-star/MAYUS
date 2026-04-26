import { NextRequest, NextResponse } from "next/server";
import { runQueuedDraftFactoryBatch } from "@/lib/lex/draft-factory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeLimit(value: string | null, fallback: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");

  if (process.env.NODE_ENV === "production" && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const startedAt = Date.now();
    const { searchParams } = new URL(request.url);
    const limit = normalizeLimit(searchParams.get("limit"), 3);
    const processTaskId = String(searchParams.get("process_task_id") || "").trim() || null;

    const result = await runQueuedDraftFactoryBatch({
      limit,
      processTaskId,
    });

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      ...result,
    });
  } catch (error: any) {
    console.error("[draft-factory-queue] fatal", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar a fila headless da Draft Factory." },
      { status: 500 }
    );
  }
}
