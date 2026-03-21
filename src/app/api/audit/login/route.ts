import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { email, success, userId, tenantId, errorMsg } = await req.json();
    const supabase = createClient();
    
    // Captura metadados do navegador e rede do Edge
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || "Unknown";

    // Insere no nosso Banco de Auditoria protegido
    const action = success ? "LOGIN_SUCCESS" : "LOGIN_FAILED";
    
    const { error: logError } = await supabase
      .from("audit_logs")
      .insert({
        tenant_id: tenantId || null,
        actor_id: userId || null, 
        action: action,
        entity: "auth",
        ip_address: ip,
        user_agent: userAgent,
        new_data: {
          email_attempt: email,
          error_message: errorMsg || null
        }
      });

    if (logError) {
      console.error("Erro gravando Audit Log:", logError);
      return NextResponse.json({ error: "Log failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
