/** @type {import('next').NextConfig} */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { }
        },
      },
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const authClient = await getAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // 1. Busca Perfil e Role
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });
    }

    // 2. Role Check: Restrição Executiva (admin, socio, Administrador)
    const permittedRoles = ["admin", "socio", "Sócio", "Administrador"];
    if (!permittedRoles.includes(profile.role || "")) {
       return NextResponse.json({ error: "Acesso restrito ao nível executivo." }, { status: 403 });
    }

    // 3. Busca Integração ElevenLabs do Tenant
    const { data: integration, error: intError } = await adminSupabase
      .from("tenant_integrations")
      .select("api_key, metadata")
      .eq("tenant_id", profile.tenant_id)
      .eq("provider", "elevenlabs")
      .maybeSingle();

    if (intError || !integration?.api_key || !integration?.metadata?.agent_id) {
       return NextResponse.json({ error: "Configuração do Agente ElevenLabs não encontrada ou incompleta." }, { status: 400 });
    }

    // 4. Solicita a Signed URL para a ElevenLabs (Xi-API-Key protegida no Header)
    // A chave NUNCA é enviada para o frontend.
    const agent_id = integration.metadata.agent_id;
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agent_id}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': integration.api_key
        }
      }
    );

    if (!response.ok) {
       const errorData = await response.json().catch(() => ({}));
       console.error("ElevenLabs API Error:", errorData);
       return NextResponse.json({ error: "Falha na autenticação externa com ElevenLabs." }, { status: 502 });
    }

    const { signed_url } = await response.json();
    
    // 5. Retorna unicamente a URL temporária
    return NextResponse.json({ signed_url });

  } catch (err: any) {
    console.error("Critical SignedURL Error:", err);
    return NextResponse.json({ error: "Erro interno no servidor de voz." }, { status: 500 });
  }
}
