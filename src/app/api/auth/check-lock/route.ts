import { NextResponse } from "next/server";
import { isAccountLocked } from "@/lib/login-attempts";

export const dynamic = "force-dynamic";

const CHECK_LOCK_TIMEOUT_MS = 1800;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Parâmetro 'email' obrigatório." },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHECK_LOCK_TIMEOUT_MS);
    const result = await isAccountLocked(email, controller.signal)
      .finally(() => clearTimeout(timeoutId));

    return NextResponse.json(result);
  } catch (err) {
    console.error("Erro na rota check-lock:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
