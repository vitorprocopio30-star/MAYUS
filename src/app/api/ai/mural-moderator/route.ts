import { NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { callLLMWithFallback } from "@/lib/llm-fallback";
import { normalizeLLMProvider } from "@/lib/llm-router";

export const dynamic = "force-dynamic";

type ModerationResult = {
  isApproved?: boolean;
  reason?: string;
  sentiment?: string;
};

function extractJsonObject(raw: string): ModerationResult {
  const trimmed = raw.trim();
  const directMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!directMatch) {
    throw new Error("A IA moderadora nao retornou JSON valido.");
  }

  return JSON.parse(directMatch[0]) as ModerationResult;
}

function extractTextFromLLMResponse(data: unknown) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";

  const response = data as {
    choices?: Array<{ message?: { content?: unknown } }>;
    content?: Array<{ type?: string; text?: string }>;
  };

  const openAIContent = response.choices?.[0]?.message?.content;
  if (typeof openAIContent === "string") return openAIContent;

  if (Array.isArray(response.content)) {
    return response.content
      .filter((item) => item?.type === "text" || typeof item?.text === "string")
      .map((item) => item?.text || "")
      .join("\n");
  }

  return "";
}

function createProviderAwareFetch(systemPrompt: string): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("api.anthropic.com")) {
      return fetch(input, init);
    }

    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const messages = Array.isArray(body.messages)
      ? body.messages.filter((message: any) => message?.role !== "system")
      : [{ role: "user", content: "" }];

    return fetch(input, {
      ...init,
      body: JSON.stringify({
        model: body.model,
        system: systemPrompt,
        max_tokens: body.max_tokens || 300,
        temperature: body.temperature,
        messages,
      }),
    });
  };
}

export async function POST(req: Request) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { content, provider } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "Conteudo ausente para moderacao." }, { status: 400 });
    }

    const systemPrompt = `Voce e o AGENTE GUARDIAO do mural de feedbacks da empresa.
Sua tarefa e ler a mensagem do funcionario e aprovar ou reprovar, garantindo que nao haja palavroes, xingamentos explicitos, discriminacao, racismo ou preconceito.
Criticas profissionais e reclamacoes sao PERMITIDAS, desde que sem baixaria.

Retorne EXATAMENTE UM JSON valido (sem codificadores markdown, apenas as chaves puras) com o formato:
{
  "isApproved": boolean,
  "reason": "Se isApproved for false, escreva o porque de forma gentil para o funcionario.",
  "sentiment": "positive" | "negative" | "neutral"
}`;

    const aiResult = await callLLMWithFallback<unknown>({
      supabase: brainAdminSupabase,
      tenantId: auth.context.tenantId,
      useCase: "task_manager",
      preferredProvider: normalizeLLMProvider(provider),
      allowNonOpenAICompatible: true,
      request: {
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
      },
      fetchImpl: createProviderAwareFetch(systemPrompt),
    });

    if (aiResult.ok === false) {
      return NextResponse.json(
        {
          error: aiResult.notice.message,
          ai_notice: aiResult.notice,
        },
        { status: aiResult.failureKind === "missing_key" || aiResult.failureKind === "invalid_key" ? 400 : 503 }
      );
    }

    const parsed = extractJsonObject(extractTextFromLLMResponse(aiResult.data));
    return NextResponse.json({ ...parsed, ai_notice: aiResult.notice || null });
  } catch (error) {
    console.error("Erro na moderacao:", error);
    return NextResponse.json(
      { error: "Nao foi possivel validar o feedback com seguranca. Tente novamente em instantes." },
      { status: 503 }
    );
  }
}
