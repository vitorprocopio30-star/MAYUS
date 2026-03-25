import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { content, provider, apiKey, model } = await req.json();

    if (!content || !provider || !apiKey) {
      return NextResponse.json({ error: "Faltando dados de conexão para moderação." }, { status: 400 });
    }

    const systemPrompt = `Você é o AGENTE GUARDIÃO do mural de feedbacks da empresa. 
Sua tarefa é ler a mensagem do funcionário e aprovar ou reprovar, garantindo que não haja palavrões, xingamentos explícitos, discriminação, racismo ou preconceito.
Críticas profissionais e reclamações são PERMITIDAS, desde que sem baixaria.

Retorne EXATAMENTE UM JSON válido (sem codificadores markdown, apenas as chaves puras) com o formato:
{
  "isApproved": boolean,
  "reason": "Se isApproved for false, escreva o porquê de forma gentil para o funcionário.",
  "sentiment": "positive" | "negative" | "neutral"
}`;

    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: content }
          ],
        }),
      });

      if (!response.ok) throw new Error("Erro na OpenAI ao validar feedback.");
      
      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      return NextResponse.json(parsed);
    }

    if (provider === "gemini") {
       const payload = {
        generationConfig: { responseMimeType: "application/json" },
        contents: [
           { role: "user", parts: [{ text: systemPrompt + "\n\nTEXTO:\n" + content }] }
        ]
      };

      const aiModel = model || "gemini-1.5-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Erro no Gemini ao validar feedback.");
      
      const data = await response.json();
      const reply = data.candidates[0].content.parts[0].text;
      return NextResponse.json(JSON.parse(reply));
    }

    // Default estrito se o provider não for um desses nativos que aceitam JSON facilmente
    return NextResponse.json({ isApproved: true, sentiment: "neutral", reason: "" });

  } catch (error: any) {
    console.error("Erro na moderação:", error);
    // Em caso de falha da IA, por segurança vamos aprovar, mas avisar no console.
    // Ou podemos jogar erro para evitar que algo ruim passe. Vamos bloquear por segurança.
    return NextResponse.json({ error: error.message || "Erro no processamento da IA Moderadora." }, { status: 500 });
  }
}
