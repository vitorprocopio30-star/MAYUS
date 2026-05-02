import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,120}$/;

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();

  if (!TOKEN_PATTERN.test(token)) {
    return new NextResponse("Relatorio nao encontrado.", { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("brain_artifacts")
    .select("id, title, metadata")
    .eq("artifact_type", "daily_playbook")
    .eq("metadata->>html_report_share_token", token)
    .maybeSingle<{ id: string; title: string | null; metadata: Record<string, unknown> | null }>();

  const html = typeof data?.metadata?.html_report === "string" ? data.metadata.html_report : null;

  if (error || !html) {
    return new NextResponse("Relatorio nao encontrado.", { status: 404 });
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; base-uri 'none'; frame-ancestors 'self'",
    },
  });
}
