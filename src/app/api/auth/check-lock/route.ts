import { NextResponse } from "next/server";
import { isAccountLocked } from "@/lib/login-attempts";

export const dynamic = "force-dynamic";

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

    const result = await isAccountLocked(email);

    return NextResponse.json(result);
  } catch (err) {
    console.error("Erro na rota check-lock:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
