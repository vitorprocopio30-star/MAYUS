import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { provider, apiKey } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider ou chave de API ausente." },
        { status: 400 }
      );
    }

    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: "Responda apenas com a palavra: PONG" }],
          max_tokens: 5,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Erro de autenticação na OpenAI.");
      }

      return NextResponse.json({ success: true, message: "Conexão com OpenAI (ChatGPT) estabelecida!" });
    }

    if (provider === "gemini") {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Responda apenas com a palavra: PONG" }] }],
        }),
      });

      if (!response.ok) {
        throw new Error("Erro de autenticação no Google Gemini.");
      }
      return NextResponse.json({ success: true, message: "Conexão com Google Gemini estabelecida!" });
    }

    if (provider === "openrouter") {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openrouter/auto", // generic quick model for testing
          messages: [{ role: "user", content: "Responda apenas com a palavra: PONG" }],
        }),
      });

      if (!response.ok) {
        throw new Error("Erro de autenticação no OpenRouter.");
      }
      return NextResponse.json({ success: true, message: "Conexão com OpenRouter estabelecida!" });
    }

    // Provedor genérico ou não mapeado ainda
    return NextResponse.json({ success: true, message: `Integração pronta para o provedor: ${provider}. (Teste específico em breve)` });
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Falha ao conectar com o modelo de IA." },
      { status: 500 }
    );
  }
}
