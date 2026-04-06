import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Helper para pegar Auth Client Seguro */
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
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text");
    const providerParam = searchParams.get("provider");
    const voiceParam = searchParams.get("voice");

    if (!text) {
      return NextResponse.json({ error: "Texto não fornecido." }, { status: 400 });
    }

    // 1. Autenticação Segura via Cookies (getUser nativo contra backend)
    const authClient = await getAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    // Pega o Tenant do Profile via Admin
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "Tenant isolado não encontrado." }, { status: 403 });
    }

    const tenantId = profile.tenant_id;

    // 2. Busca a configuração de voz
    const { data: settings } = await adminSupabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const provider = providerParam || settings?.ai_features?.voice_provider || "openai";
    const openAiVoice = voiceParam || settings?.ai_features?.openai_voice || "nova";

    // 3. Execução condicional: OpenAI
    if (provider === "openai") {
      const { data: integration } = await adminSupabase
        .from("tenant_integrations")
        .select("api_key")
        .eq("tenant_id", tenantId)
        .eq("provider", "openai")
        .single();

      if (!integration?.api_key) {
        return NextResponse.json({ error: "OpenAI API Key não configurada." }, { status: 400 });
      }

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1", // Mais rápido para tempo real
          input: text,
          voice: openAiVoice, // Configurada pelo admin (padrao: nova)
          speed: 1.20, // Mantendo o ajuste pré-existente
        }),
      });

      if (!response.ok) throw new Error("Erro na sintaxe de áudio da OpenAI.");

      return new NextResponse(response.body, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        },
      });
    }

    // 4. Execução condicional: ElevenLabs
    if (provider === "elevenlabs") {
      // Tenta pegar do Ambiente primeiro (Global/Fallback)
      let apiKey = process.env.ELEVENLABS_API_KEY;
      let voiceId = process.env.ELEVENLABS_VOICE_ID;

      // Se não houver no ambiente, busca no Banco Integration (Tenant-specific)
      if (!apiKey || !voiceId) {
        const { data: integration } = await adminSupabase
          .from("tenant_integrations")
          .select("api_key, instance_name")
          .eq("tenant_id", tenantId)
          .eq("provider", "elevenlabs")
          .maybeSingle();
        
        if (integration?.api_key) apiKey = integration.api_key;
        if (integration?.instance_name) voiceId = integration.instance_name;
      }

      if (!apiKey || !voiceId) {
        return NextResponse.json({ error: "ElevenLabs API Key ou Voice ID ausentes (Ambiente/Banco)." }, { status: 400 });
      }

      const elevenVoiceId = voiceParam || voiceId;

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2", // Modelo top-tier robusto para PT-BR
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("ElevenLabs Error Details:", errorData);
        throw new Error(`ElevenLabs: ${errorData?.detail?.message || "Erro na geração de áudio."}`);
      }

      // Streaming Raw (Para áudio imediato enquanto sintetiza, similar ao OpenAI)
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        },
      });
    }

    return NextResponse.json({ error: "Voice Provider desconhecido." }, { status: 400 });

  } catch (error: any) {
    console.error("Erro na Rota TTS:", error);
    return NextResponse.json({ error: error.message || "Erro interno no TTS." }, { status: 500 });
  }
}
