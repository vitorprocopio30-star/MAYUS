import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BetaAccessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(40).optional().or(z.literal("")).nullable(),
  firmName: z.string().trim().max(160).optional().or(z.literal("")).nullable(),
  role: z.string().trim().max(80).optional().or(z.literal("")).nullable(),
  teamSize: z.string().trim().max(40).optional().or(z.literal("")).nullable(),
  mainPain: z.string().trim().min(8).max(1200),
  priority: z.string().trim().max(80).optional().or(z.literal("")).nullable(),
  landingPage: z.string().trim().max(240).optional().or(z.literal("")).nullable(),
  referrer: z.string().trim().max(500).optional().or(z.literal("")).nullable(),
  utmSource: z.string().trim().max(120).optional().or(z.literal("")).nullable(),
  utmMedium: z.string().trim().max(120).optional().or(z.literal("")).nullable(),
  utmCampaign: z.string().trim().max(180).optional().or(z.literal("")).nullable(),
  utmContent: z.string().trim().max(180).optional().or(z.literal("")).nullable(),
  consent: z.boolean(),
  website: z.string().optional().nullable(),
}).refine((data) => Boolean(data.email || data.phone), {
  message: "Informe email ou WhatsApp.",
  path: ["email"],
}).refine((data) => data.consent === true, {
  message: "Confirme o consentimento para contato.",
  path: ["consent"],
});

function normalizeOptional(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = BetaAccessSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    if (normalizeOptional(parsed.data.website)) {
      return NextResponse.json({ success: true, accepted: true });
    }

    const payload = {
      name: parsed.data.name,
      email: normalizeOptional(parsed.data.email),
      phone: normalizeOptional(parsed.data.phone),
      firm_name: normalizeOptional(parsed.data.firmName),
      role: normalizeOptional(parsed.data.role),
      team_size: normalizeOptional(parsed.data.teamSize),
      main_pain: parsed.data.mainPain,
      priority: normalizeOptional(parsed.data.priority),
      landing_page: normalizeOptional(parsed.data.landingPage),
      referrer: normalizeOptional(parsed.data.referrer),
      utm_source: normalizeOptional(parsed.data.utmSource),
      utm_medium: normalizeOptional(parsed.data.utmMedium),
      utm_campaign: normalizeOptional(parsed.data.utmCampaign),
      utm_content: normalizeOptional(parsed.data.utmContent),
      requested_at: new Date().toISOString(),
      user_agent: request.headers.get("user-agent")?.slice(0, 240) || null,
    };

    const { error } = await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: null,
      user_id: null,
      source: "public_sales",
      provider: "mayus_site",
      event_name: "beta_access_requested",
      status: "pending",
      payload,
      created_at: payload.requested_at,
    });

    if (error) {
      console.error("[public][beta-access]", error.message);
      return NextResponse.json({ error: "Nao foi possivel registrar o pedido agora." }, { status: 500 });
    }

    return NextResponse.json({ success: true, accepted: true });
  } catch (error: any) {
    console.error("[public][beta-access]", error);
    return NextResponse.json({ error: "Nao foi possivel registrar o pedido agora." }, { status: 500 });
  }
}
