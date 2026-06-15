import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function safeString(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized
    .replace(/(password|senha|token|secret|key)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
    .slice(0, maxLength);
}

function firstIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const candidate = forwardedFor?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
  return safeString(candidate, 80) || "0.0.0.0";
}

export async function POST(req: Request) {
  try {
    const { email, success, userId, tenantId, errorMsg } = await req.json();
    const ip = firstIp(req);
    const userAgent = safeString(req.headers.get("user-agent"), 300) || "Unknown";

    const action = success ? "LOGIN_SUCCESS" : "LOGIN_FAILED";

    const { error: logError } = await supabaseAdmin
      .from("audit_logs")
      .insert({
        tenant_id: safeString(tenantId, 80),
        actor_id: safeString(userId, 80),
        action: action,
        entity: "auth",
        ip_address: ip,
        user_agent: userAgent,
        new_data: {
          email_attempt: safeString(email, 320),
          error_message: safeString(errorMsg),
        }
      });

    if (logError) {
      console.warn("[audit/login] log insert failed", logError.message);
      return NextResponse.json({ success: true, audit_logged: false });
    }

    return NextResponse.json({ success: true, audit_logged: true });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
