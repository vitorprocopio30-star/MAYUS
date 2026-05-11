import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getBrainAuthContext } from "@/lib/brain/server";
import { requireTenantApiKey } from "@/lib/integrations/server";
import {
  MAYUS_REALTIME_BRL_PER_USD,
  MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL,
} from "@/lib/voice/realtime-persona";

export const dynamic = "force-dynamic";

const EXECUTIVE_ROLES = new Set(["admin", "administrador", "socio", "mayus_admin"]);
const DEFAULT_SEARCH_MODEL = "gpt-5.4-mini";

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safetyIdentifier(userId: string, tenantId: string) {
  return createHash("sha256")
    .update(`${tenantId}:${userId}`)
    .digest("hex");
}

function extractResponseText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  const parts: string[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    if (typeof value.text === "string" && value.text.trim()) parts.push(value.text.trim());
    if (typeof value.summary === "string" && value.summary.trim()) parts.push(value.summary.trim());
    if (value.content) visit(value.content);
    if (value.output) visit(value.output);
  };

  visit(data?.output);
  return Array.from(new Set(parts)).join("\n").trim();
}

function extractSources(data: any) {
  const sources = new Map<string, { title: string; url: string }>();
  const add = (url: unknown, title: unknown) => {
    const cleanUrl = cleanString(url);
    if (!/^https?:\/\//i.test(cleanUrl)) return;
    sources.set(cleanUrl, {
      url: cleanUrl,
      title: cleanString(title, cleanUrl),
    });
  };

  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;

    if (value.type === "url_citation" || value.url) add(value.url, value.title);
    if (Array.isArray(value.annotations)) visit(value.annotations);
    if (Array.isArray(value.sources)) visit(value.sources);
    if (Array.isArray(value.content)) visit(value.content);
    if (Array.isArray(value.output)) visit(value.output);
  };

  visit(data?.sources);
  visit(data?.output);
  return Array.from(sources.values()).slice(0, 6);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!EXECUTIVE_ROLES.has(normalize(auth.context.userRole))) {
      return NextResponse.json({ error: "Acesso restrito ao nivel executivo." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const query = cleanString(body.query).slice(0, 1000);
    if (!query) {
      return NextResponse.json({ ok: false, error: "Informe o que devo pesquisar." }, { status: 400 });
    }

    const { apiKey } = await requireTenantApiKey(auth.context.tenantId, "openai");
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API Key nao configurada." }, { status: 400 });
    }

    const model = cleanString(process.env.MAYUS_WEB_SEARCH_MODEL, DEFAULT_SEARCH_MODEL);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(auth.context.userId, auth.context.tenantId),
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "Voce e o MAYUS pesquisando para um escritorio de advocacia. Responda em portugues brasileiro, curto, com cautela e sem inventar. Se nao houver fonte clara, diga que nao conseguiu confirmar.",
          },
          {
            role: "user",
            content: [
              `Pergunta: ${query}`,
              cleanString(body.reason) ? `Motivo: ${cleanString(body.reason)}` : null,
              cleanString(body.conversationSummary) ? `Contexto: ${cleanString(body.conversationSummary)}` : null,
            ].filter(Boolean).join("\n"),
          },
        ],
        tools: [{ type: "web_search" }],
        tool_choice: "required",
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[voice/realtime-web-search] OpenAI rejected web search", {
        status: response.status,
        error: data?.error?.message || data?.error || "unknown",
      });
      return NextResponse.json({ error: "Nao consegui pesquisar na web agora." }, { status: 502 });
    }

    const answer = extractResponseText(data) || "Nao consegui confirmar uma resposta com fonte confiavel.";
    const sources = extractSources(data);

    return NextResponse.json({
      ok: true,
      model,
      answer,
      sources,
      cost: {
        usd: MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL,
        brl: MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL * MAYUS_REALTIME_BRL_PER_USD,
      },
    });
  } catch (error) {
    console.error("[voice/realtime-web-search] fatal", error);
    return NextResponse.json({ error: "Erro interno na pesquisa web do MAYUS Realtime." }, { status: 500 });
  }
}

