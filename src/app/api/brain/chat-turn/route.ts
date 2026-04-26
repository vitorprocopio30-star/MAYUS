import { NextRequest, NextResponse } from "next/server";
import { getBrainAuthContext } from "@/lib/brain/server";
import { executeBrainTurn, normalizeChatHistory } from "@/lib/brain/turn";

export const dynamic = "force-dynamic";

type ChatTurnBody = {
  message?: string;
  provider?: string;
  model?: string;
  history?: Array<{ role?: string; content?: string }>;
  conversationId?: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as ChatTurnBody;
    const message = normalizeString(body.message);

    if (!message) {
      return NextResponse.json({ error: "message e obrigatoria." }, { status: 400 });
    }

    const history = normalizeChatHistory(body.history);
    const conversationId = normalizeString(body.conversationId) || null;
    const preferredProvider = normalizeString(body.provider) || null;
    const model = normalizeString(body.model) || null;
    const cookieHeader = req.headers.get("cookie") ?? "";

    const turn = await executeBrainTurn({
      authContext: auth.context,
      baseUrl: req.url,
      cookieHeader,
      goal: message,
      title: `Chat mission: ${message.slice(0, 72)}`,
      module: "mayus",
      channel: "chat",
      taskInput: {
        message,
        history,
        conversation_id: conversationId,
      },
      taskContext: {
        source: "dashboard_mayus",
        conversation_id: conversationId,
      },
      policySnapshot: {
        surface: "dashboard_mayus",
      },
      preferredProvider,
      model,
      history,
      learningEventType: "chat_turn_processed",
      learningPayload: {
        conversation_id: conversationId,
      },
    });

    return NextResponse.json({
      reply: turn.reply,
      kernel: turn.kernel,
      taskId: turn.taskId,
      runId: turn.runId,
      stepId: turn.stepId,
    }, { status: turn.responseStatus });
  } catch (error: any) {
    console.error("[brain/chat-turn] fatal", error);
    return NextResponse.json({ error: error?.message || "Erro interno ao processar a missao do chat." }, { status: 500 });
  }
}
