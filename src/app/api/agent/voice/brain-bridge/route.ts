import { NextRequest, NextResponse } from "next/server";
import { getBrainAuthContext } from "@/lib/brain/server";
import { executeBrainTurn, normalizeChatHistory } from "@/lib/brain/turn";

export const dynamic = "force-dynamic";

type VoiceBridgeBody = {
  prompt?: string;
  history?: Array<{ role?: string; content?: string }>;
  toolName?: string;
  toolPayload?: Record<string, unknown>;
};

const EXECUTIVE_ROLES = new Set(["admin", "administrador", "socio", "sócio", "mayus_admin"]);

function normalizeRole(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function resolvePrompt(prompt: unknown, toolName: unknown, toolPayload: unknown) {
  const directPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (directPrompt) return directPrompt;

  const normalizedToolName = typeof toolName === "string" ? toolName.trim() : "voice_shell";
  const payload = toolPayload && typeof toolPayload === "object" && !Array.isArray(toolPayload)
    ? (toolPayload as Record<string, unknown>)
    : {};

  const embeddedPrompt = [payload.prompt, payload.message, payload.instruction]
    .find((value) => typeof value === "string" && value.trim().length > 0);

  if (typeof embeddedPrompt === "string") return embeddedPrompt.trim();

  return [
    "Solicitacao recebida pelo shell de voz ElevenLabs do MAYUS.",
    `Tool solicitado: ${normalizedToolName}.`,
    `Payload: ${JSON.stringify(payload)}.`,
    "Interprete o pedido, decida a melhor acao e responda em linguagem natural para o usuario.",
  ].join("\n");
}


export async function POST(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!EXECUTIVE_ROLES.has(normalizeRole(auth.context.userRole))) {
      return NextResponse.json({ error: "Acesso restrito ao nivel executivo." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as VoiceBridgeBody;
    const prompt = resolvePrompt(body.prompt, body.toolName, body.toolPayload);

    if (!prompt) {
      return NextResponse.json({ error: "Nenhum prompt foi enviado ao cerebro principal." }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") ?? "";
    const history = normalizeChatHistory(body.history);
    const normalizedToolName = typeof body.toolName === "string" && body.toolName.trim() ? body.toolName.trim() : "voice_shell";
    const toolPayload = body.toolPayload && typeof body.toolPayload === "object" && !Array.isArray(body.toolPayload)
      ? body.toolPayload
      : {};

    const turn = await executeBrainTurn({
      authContext: auth.context,
      baseUrl: req.url,
      cookieHeader,
      goal: prompt,
      title: `Voice mission: ${prompt.slice(0, 72)}`,
      module: "voice",
      channel: "voice",
      taskInput: {
        prompt,
        history,
        tool_name: normalizedToolName,
        tool_payload: toolPayload,
      },
      taskContext: {
        source: "elevenlabs_voice_shell",
        provider: "elevenlabs",
        humanized_layer: true,
      },
      policySnapshot: {
        voice_shell_optional: true,
      },
      history,
      learningEventType: "voice_turn_processed",
      learningPayload: {
        tool_name: normalizedToolName,
        tool_payload: toolPayload,
      },
    });

    return NextResponse.json({
      reply: turn.reply,
      kernel: turn.kernel,
      taskId: turn.taskId,
      runId: turn.runId,
      stepId: turn.stepId,
      orb: turn.orb,
    }, { status: turn.responseStatus });
  } catch (error) {
    console.error("[voice/brain-bridge] fatal", error);
    return NextResponse.json({ error: "Erro interno na ponte entre ElevenLabs e MAYUS Brain." }, { status: 500 });
  }
}
