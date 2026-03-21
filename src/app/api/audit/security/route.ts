import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { action, reason, originUrl, targetUrl } = await req.json();
    const supabase = createClient();
    
    // Pega informações da requisição para Auditoria
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || "Unknown";

    // Pega os dados do Usuário Infrator
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "No user found" }, { status: 401 });
    }

    const { error: logError } = await supabase
      .from("audit_logs")
      .insert({
        tenant_id: user.app_metadata?.tenant_id || null,
        actor_id: user.id, 
        action: action, // Ex: 'UNAUTHORIZED_ACCESS'
        entity: "routes",
        ip_address: ip,
        user_agent: userAgent,
        new_data: {
          reason: reason,
          origin_url: originUrl,
          target_url: targetUrl,
          role: user.app_metadata?.role
        }
      });

    if (logError) {
      console.error("Erro gravando Violation Audit Log:", logError);
      return NextResponse.json({ error: "Log failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
