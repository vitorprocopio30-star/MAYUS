import { NextResponse } from "next/server";

// Suporta GET para permitir Streaming Nativo pelo HTML5 Audio
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text");
    const apiKey = searchParams.get("apiKey");
    const voice = searchParams.get("voice") || "onyx";
    const speedParam = searchParams.get("speed") || "1.20"; // Acelerado 20% por padrão para ficar super inteligente e ágil!
    const speed = parseFloat(speedParam);

    if (!text || !apiKey) {
      return NextResponse.json(
        { error: "Texto ou chave de API não fornecidos." },
        { status: 400 }
      );
    }

    // Faz a requisição direto para a OpenAI TTS (em modo mp3 rápido)
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1", // tts-1 é o mais rápido para tempo real.
        input: text,
        voice: voice,
        speed: speed, // INJEÇÃO DA VELOCIDADE AQUI!
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI TTS Error:", errorData);
      throw new Error(errorData.error?.message || "Erro ao gerar áudio na OpenAI.");
    }

    // Retorna o STREAM bruto diretamente (NÃO ESPERA BAIXAR TUDO)
    // O navegador vai tocando as sílabas enquanto chegam da rede!
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
    });
    
  } catch (error: any) {
    console.error("Erro na Rota TTS:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno no processamento de voz." },
      { status: 500 }
    );
  }
}

