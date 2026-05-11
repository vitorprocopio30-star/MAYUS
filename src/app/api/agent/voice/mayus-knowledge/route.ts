import { NextRequest, NextResponse } from "next/server";
import { getBrainAuthContext } from "@/lib/brain/server";
import { answerMayusProductQuestion } from "@/lib/mayus/product-knowledge";

export const dynamic = "force-dynamic";

const EXECUTIVE_ROLES = new Set(["admin", "administrador", "socio", "mayus_admin"]);

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
    const question = cleanString(body.question, "O que e o MAYUS?");
    const result = answerMayusProductQuestion(question);

    return NextResponse.json({
      ok: true,
      answer: result.answer,
      sources: result.sources,
    });
  } catch (error) {
    console.error("[voice/mayus-knowledge] fatal", error);
    return NextResponse.json({ error: "Erro interno ao consultar a base do MAYUS." }, { status: 500 });
  }
}

