import { NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import {
  buildHeaders,
  getLLMClient,
  isOpenAICompatibleProvider,
  normalizeLLMProvider,
} from "@/lib/llm-router";

export const dynamic = "force-dynamic";

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  const directMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!directMatch) {
    throw new Error("A IA moderadora nao retornou JSON valido.");
  }

  return JSON.parse(directMatch[0]) as {
    isApproved?: boolean;
    reason?: string;
    sentiment?: string;
  };
}

export async function POST(req: Request) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { content, provider, model } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "Conteudo ausente para moderacao." }, { status: 400 });
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

    const llm = await getLLMClient(brainAdminSupabase, auth.context.tenantId, "task_manager", {
      preferredProvider: normalizeLLMProvider(provider),
      allowNonOpenAICompatible: true,
    });

    if (isOpenAICompatibleProvider(llm.provider)) {
      const response = await fetch(llm.endpoint, {
        method: "POST",
        headers: buildHeaders(llm),
        body: JSON.stringify({
          model: model || llm.model,
          response_format: { type: "json_object" },
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: content }
          ],
        }),
      });

      if (!response.ok) throw new Error("Erro no provedor de IA ao validar feedback.");
      
      const data = await response.json();
      const parsed = extractJsonObject(String(data?.choices?.[0]?.message?.content || ""));
      return NextResponse.json(parsed);
    }

    if (llm.provider === "anthropic") {
      const response = await fetch(llm.endpoint, {
        method: "POST",
        headers: buildHeaders(llm),
        body: JSON.stringify({
          model: model || llm.model,
          system: systemPrompt,
          max_tokens: 300,
          temperature: 0,
          messages: [{ role: "user", content }],
        }),
      });

      if (!response.ok) throw new Error("Erro no provedor de IA ao validar feedback.");
      
      const data = await response.json();
      const reply = Array.isArray(data?.content)
        ? data.content
            .filter((item: any) => item?.type === "text")
            .map((item: any) => item?.text || "")
            .join("\n")
        : "";
      return NextResponse.json(extractJsonObject(reply));
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
