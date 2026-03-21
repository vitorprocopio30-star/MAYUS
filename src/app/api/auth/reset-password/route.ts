import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "E-mail é obrigatório." }, { status: 400 });
    }

    // Para operações de servidor que não dependem da sessão do usuário que faz a requisição,
    // usamos o cliente padrão instanciado com a Service Role Key ou Anon Key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    // Inicializa cliente sem tentar acessar cookies() do Next.js
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Usa o Supabase Auth para enviar o e-mail de reset nativamente
    // O Supabase cuida do envio do e-mail automaticamente
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/update-password`,
    });

    if (authError) {
      console.error("Erro no reset de senha:", authError.message);
      // Não revelamos se o e-mail existe ou não (segurança)
      return NextResponse.json({ 
        success: true, 
        message: "Se o e-mail estiver cadastrado, um link de recuperação foi enviado." 
      });
    }

    // Grava no Audit Log (best effort, sem quebrar o fluxo)
    try {
      await supabase.from('audit_logs').insert({
        action: "PASSWORD_RESET_REQUESTED",
        entity: "auth",
        new_data: { target_email: email },
        ip_address: req.headers.get("x-forwarded-for") || "unknown"
      });
    } catch (auditErr) {
      // Silencioso — não impede o fluxo principal
    }

    return NextResponse.json({ 
      success: true, 
      message: "Se o e-mail estiver cadastrado, um link de recuperação foi enviado." 
    });

  } catch (err) {
    console.error("Erro na rota reset-password:", err);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
